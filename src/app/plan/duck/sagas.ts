import { takeEvery, takeLatest, select, retry, race, call, delay, put, take } from 'redux-saga/effects';
import { ClientFactory } from '../../../client/client_factory';
import { IClusterClient } from '../../../client/client';
import { updateMigPlanFromValues } from '../../../client/resources/conversions';
import {
  AlertActions,
} from '../../common/duck/actions';
import { PlanActions, PlanActionTypes } from './actions';
import { CurrentPlanState } from './reducers';
import {
  MigResource,
  ExtendedCoreNamespacedResource,
  CoreNamespacedResourceKind,
  ExtendedCoreNamespacedResourceKind,
  CoreClusterResource,
  CoreClusterResourceKind,
  CoreNamespacedResource,
  MigResourceKind
} from '../../../client/resources';
import { IMigPlan, IMigMigration } from '../../../client/resources/conversions';
import Q from 'q';

const PlanUpdateTotalTries = 6;
const PlanUpdateRetryPeriodSeconds = 5;

const ControllerPodLabel = 'control-plane=controller-manager';
const VeleroPodLabel = 'component=velero';
const ResticPodLabel = 'name=restic';

export enum LogKind {
  velero = 'velero',
  restic = 'restic',
  controller = 'controller'
}

export enum ClusterKind {
  source = 'source',
  target = 'target',
  host = 'host',
}

export interface ILog {
  podName: string;
  log: string;
}

export type IMigrationClusterLogType = {
  [key in LogKind]?: ILog[];
};

export interface IMigrationClusterLog extends IMigrationClusterLogType {
  clusterName: string;
}

export type IMigrationClusterLogList = {
  [key in ClusterKind]: IMigrationClusterLog;
};

export interface IMigrationLogs extends IMigrationClusterLogList {
  plan: IMigPlan;
  migrations: IMigMigration[];
}

function* checkPVs(action) {
  const params = { ...action.params };
  let pvsFound = false;
  let tries = 0;
  const TicksUntilTimeout = 20;

  while (!pvsFound) {
    if (tries < TicksUntilTimeout) {
      tries += 1;
      const plansRes = yield call(params.asyncFetch);
      const pollingStatus = params.callback(plansRes);
      switch (pollingStatus) {
        case 'SUCCESS':
          pvsFound = true;
          yield put({ type: PlanActionTypes.STOP_PV_POLLING });
          break;
        case 'FAILURE':
          pvsFound = true;
          PlanActions.stopPVPolling();
          yield put({ type: PlanActionTypes.STOP_PV_POLLING });
          break;
        default:
          break;
      }
      yield delay(params.delay);
    } else {
      // PV discovery timed out, alert and stop polling
      pvsFound = true; // No PVs timed out
      PlanActions.stopPVPolling();
      yield put(AlertActions.alertErrorTimeout('Timed out during PV discovery'));
      yield put({ type: PlanActionTypes.PV_FETCH_SUCCESS, });
      yield put({ type: PlanActionTypes.STOP_PV_POLLING });
      break;
    }
  }
}

function* getPlanSaga(planName) {
  const state = yield select();
  const migMeta = state.migMeta;
  const client: IClusterClient = ClientFactory.hostCluster(state);
  try {
    return yield client.get(
      new MigResource(MigResourceKind.MigPlan, migMeta.namespace),
      planName
    );
  } catch (err) {
    throw err;
  }
}
function* putPlanSaga(planValues) {
  const state = yield select();
  const migMeta = state.migMeta;
  const client: IClusterClient = ClientFactory.hostCluster(state);
  try {
    const getPlanRes = yield call(getPlanSaga, planValues.planName);
    const updatedMigPlan = updateMigPlanFromValues(getPlanRes.data, planValues);
    const putPlanResponse = yield client.put(
      new MigResource(MigResourceKind.MigPlan, migMeta.namespace),
      getPlanRes.data.metadata.name,
      updatedMigPlan
    );
    yield put(PlanActions.updatePlanList(putPlanResponse.data));
  } catch (err) {
    throw err;
  }
}

function* planUpdateRetry(action) {
  try {
    yield retry(
      PlanUpdateTotalTries,
      PlanUpdateRetryPeriodSeconds * 1000,
      putPlanSaga,
      action.planValues,
    );
  } catch (error) {
    yield put(AlertActions.alertErrorTimeout('Failed to update plan'));
  }
}

function* checkClosedStatus(action) {
  let planClosed = false;
  let tries = 0;
  const TicksUntilTimeout = 8;
  while (!planClosed) {
    if (tries < TicksUntilTimeout) {
      tries += 1;
      const getPlanResponse = yield call(getPlanSaga, action.planName);
      const MigPlan = getPlanResponse.data;

      if (MigPlan.status && MigPlan.status.conditions) {
        const hasClosedCondition = !!MigPlan.status.conditions.some(c => c.type === 'Closed');
        if (hasClosedCondition) {
          yield put(PlanActions.planCloseSuccess());
          yield put(PlanActions.stopClosedStatusPolling());
        }
      }
    } else {
      planClosed = true;
      yield put(PlanActions.planCloseFailure('Failed to close plan'));
      yield put(AlertActions.alertErrorTimeout('Timed out during plan close'));
      yield put(PlanActions.stopClosedStatusPolling());
      break;
    }

    const PollingInterval = 5000;
    yield delay(PollingInterval);
  }
}

function* checkPlanStatus(action) {
  let planStatusComplete = false;
  let tries = 0;
  const TicksUntilTimeout = 10;
  while (!planStatusComplete) {
    if (tries < TicksUntilTimeout) {
      yield put(PlanActions.updateCurrentPlanStatus({ state: CurrentPlanState.Pending }));
      tries += 1;
      const getPlanResponse = yield call(getPlanSaga, action.planName);
      const MigPlan = getPlanResponse.data;
      yield put(PlanActions.setCurrentPlan(MigPlan));

      if (MigPlan.status && MigPlan.status.conditions) {
        const hasReadyCondition = !!MigPlan.status.conditions.some(c => c.type === 'Ready');
        const hasCriticalCondition = !!MigPlan.status.conditions.some(cond => {
          return cond.category === 'Critical';
        });
        const hasConflictCondition = !!MigPlan.status.conditions.some(cond => {
          return cond.type === 'PlanConflict';
        });
        if (hasReadyCondition) {
          yield put(PlanActions.updateCurrentPlanStatus({ state: CurrentPlanState.Ready, }));
          yield put(PlanActions.stopPlanStatusPolling());
        }
        if (hasCriticalCondition) {
          const criticalCond = MigPlan.status.conditions.find(cond => {
            return cond.category === 'Critical';
          });
          yield put(PlanActions.updateCurrentPlanStatus(
            { state: CurrentPlanState.Critical, errorMessage: criticalCond.message }
          ));

          yield put(PlanActions.stopPlanStatusPolling());
        }

        if (hasConflictCondition) {
          const conflictCond = MigPlan.status.conditions.find(cond => {
            return cond.type === 'PlanConflict';
          });
          yield put(PlanActions.updateCurrentPlanStatus(
            { state: CurrentPlanState.Critical, errorMessage: conflictCond.message }
          ));

          yield put(PlanActions.stopPlanStatusPolling());
        }
      }
    } else {
      planStatusComplete = true;
      yield put(PlanActions.updateCurrentPlanStatus({ state: CurrentPlanState.TimedOut }));
      yield put(PlanActions.stopPlanStatusPolling());
      break;
    }

    const PollingInterval = 5000;
    yield delay(PollingInterval);
  }
}

function* planCloseSaga(action) {
  try {
    const updatedValues = {
      planName: action.planName,
      planClosed: true,
      persistentVolumes: []
    };
    yield put(PlanActions.planUpdateRequest(updatedValues));
    yield put(PlanActions.startClosedStatusPolling(updatedValues.planName));
  }
  catch (err) {
    yield put(PlanActions.planCloseFailure(err));
    yield put(AlertActions.alertErrorTimeout('Plan close request failed'));

  }
}

function* planCloseAndDeleteSaga(action) {
  const state = yield select();
  const migMeta = state.migMeta;
  const client: IClusterClient = ClientFactory.hostCluster(state);
  try {
    yield put(PlanActions.planCloseRequest(action.planName));
    yield take(PlanActionTypes.PLAN_CLOSE_SUCCESS);
    yield client.delete(
      new MigResource(MigResourceKind.MigPlan, migMeta.namespace),
      action.planName,
    );
    yield put(PlanActions.planCloseAndDeleteSuccess(action.planName));
    yield put(AlertActions.alertSuccessTimeout(`Successfully removed plan "${action.planName}"!`));
  } catch (err) {
    yield put(PlanActions.planCloseAndDeleteFailure(err));
    yield put(AlertActions.alertErrorTimeout('Plan delete request failed'));
  }
}

function* getPVResourcesRequest(action) {
  const state = yield select();
  const client: IClusterClient = ClientFactory.forCluster(action.clusterName, state);
  try {
    const resource = new CoreClusterResource(CoreClusterResourceKind.PV);
    const pvResourceRefs = action.pvList.map(pv => {
      return client.get(
        resource,
        pv.name
      );
    });

    const pvList = [];
    yield Q.allSettled(pvResourceRefs)
      .then((results) => {
        results.forEach((result) => {
          if (result.state === 'fulfilled') {
            pvList.push(result.value.data);
          }
        });
      });
    yield put(PlanActions.getPVResourcesSuccess(pvList));
  } catch (err) {
    yield put(PlanActions.getPVResourcesFailure('Failed to get pv details'));

  }
}

function* watchPlanCloseAndDelete() {
  yield takeLatest(PlanActionTypes.PLAN_CLOSE_AND_DELETE_REQUEST, planCloseAndDeleteSaga);
}

function* watchPlanClose() {
  yield takeLatest(PlanActionTypes.PLAN_CLOSE_REQUEST, planCloseSaga);
}

function* watchClosedStatus() {
  while (true) {
    const data = yield take(PlanActionTypes.CLOSED_STATUS_POLL_START);
    yield race([call(checkClosedStatus, data), take(PlanActionTypes.CLOSED_STATUS_POLL_STOP)]);
  }
}

function* watchPlanStatus() {
  while (true) {
    const data = yield take(PlanActionTypes.PLAN_STATUS_POLL_START);
    yield race([call(checkPlanStatus, data), take(PlanActionTypes.PLAN_STATUS_POLL_STOP)]);
  }
}

function* watchPVPolling() {
  while (true) {
    const data = yield take(PlanActionTypes.START_PV_POLLING);
    yield race([call(checkPVs, data), take(PlanActionTypes.STOP_PV_POLLING)]);
  }
}

function* watchPlanUpdate() {
  yield takeEvery(PlanActionTypes.PLAN_UPDATE_REQUEST, planUpdateRetry);
}

function* watchGetPVResourcesRequest() {
  yield takeLatest(PlanActionTypes.GET_PV_RESOURCES_REQUEST, getPVResourcesRequest);
}

function extractLogs(kind, pods, logAccum, client, namespace) {
  return pods.map(veleroPod => {
    const podName = veleroPod.metadata.name;
    const veleroLog = client.get(
      new ExtendedCoreNamespacedResource(
        CoreNamespacedResourceKind.Pod,
        namespace,
        ExtendedCoreNamespacedResourceKind.Log),
      podName
    );
    veleroLog.then(vl => logAccum[kind].push({
      podName,
      log: vl.data
    }));
    return veleroLog;
  });
}

function* collectLogs(action) {
  const { plan, migrations } = action;
  const state = yield select();
  const { migMeta } = state;
  const hostClient: IClusterClient = ClientFactory.hostCluster(state, 'text');
  try {
    const migClusters = yield hostClient.list(new MigResource(MigResourceKind.MigCluster, migMeta.namespace));
    const hostCluster = migClusters.data.items.filter(migCluster => migCluster.spec.isHostCluster)[0];
    const hostClusterName = hostCluster.metadata.name;
    const sourceClusterName = plan.spec.srcMigClusterRef.name;
    const targetClusterName = plan.spec.destMigClusterRef.name;
    const planClusterNames = [sourceClusterName, targetClusterName];
    const migrationLogs: IMigrationLogs = {
      source: {
        clusterName: sourceClusterName,
        [LogKind.velero]: [],
        [LogKind.restic]: [],
      },
      target: {
        clusterName: targetClusterName,
        [LogKind.velero]: [],
        [LogKind.restic]: [],
      },
      host: {
        clusterName: hostClusterName,
        [LogKind.controller]: [],
      },
      plan,
      migrations
    };

    const controllerPods = yield hostClient.list(
      new CoreNamespacedResource(CoreNamespacedResourceKind.Pod, migMeta.configNamespace),
      { labelSelector: ControllerPodLabel }
    );

    const controllerLogs = extractLogs(
      LogKind.controller,
      controllerPods.data.items,
      migrationLogs[ClusterKind.host],
      hostClient,
      migMeta.configNamespace
    );
    yield Q.allSettled(controllerLogs);

    const remoteClusters = migClusters.data.items.filter(
      migCluster =>
        !migCluster.spec.isHostCluster &&
        planClusterNames.includes(migCluster.metadata.name))
      .map(migCluster => migCluster.metadata.name)
      .map(clusterName => {
        return {
          isSource: sourceClusterName === clusterName,
          name: clusterName,
          client: ClientFactory.forCluster(clusterName, state, 'text')
        };
      });

    // Append excluded host client
    if (remoteClusters.length < 2) {
      remoteClusters.push({
        name: hostCluster.metadata.name,
        client: hostClient
      });
    }

    const migrationPods = yield remoteClusters.map(cluster => {
      const veleroPods = cluster.client.list(
        new CoreNamespacedResource(CoreNamespacedResourceKind.Pod, migMeta.namespace),
        { labelSelector: VeleroPodLabel }
      );
      const resticPods = cluster.client.list(
        new CoreNamespacedResource(CoreNamespacedResourceKind.Pod, migMeta.namespace),
        { labelSelector: ResticPodLabel }
      );
      veleroPods.then(vp => cluster['velero'] = vp.data);
      resticPods.then(rp => cluster['restic'] = rp.data);
      return [veleroPods, resticPods];
    });
    yield Q.allSettled(migrationPods.flat());

    const logResults = yield remoteClusters.map(cluster => {
      const clusterType = cluster.isSource ? 'source' : 'target';
      const veleroLogs = extractLogs(
        LogKind.velero,
        cluster.velero.items,
        migrationLogs[clusterType],
        cluster.client,
        migMeta.namespace
      );

      const resticLogs = extractLogs(
        LogKind.restic,
        cluster.restic.items,
        migrationLogs[clusterType],
        cluster.client,
        migMeta.namespace
      );
      return veleroLogs.concat(resticLogs);
    });
    yield Q.allSettled(logResults);
    yield put(PlanActions.logsFetchSuccess(migrationLogs));
  } catch (err) {
    yield put(PlanActions.logsFetchFailure('Failed to get logs'));
  }
}

function* watchLogsPolling() {
  while (true) {
    const action = yield take(PlanActionTypes.LOGS_FETCH_REQUEST);
    yield call(collectLogs, action);
  }
}

export default {
  watchPlanUpdate,
  watchPVPolling,
  watchPlanCloseAndDelete,
  watchPlanClose,
  watchClosedStatus,
  watchPlanStatus,
  watchGetPVResourcesRequest,
  watchLogsPolling
};
