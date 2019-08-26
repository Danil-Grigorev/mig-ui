import { takeLatest, race, call, delay, take, put, select } from 'redux-saga/effects';

import {
  AlertActions,
  PollingActions,
  PollingActionTypes,
  AlertActionTypes
} from '../../common/duck/actions';
import { PlanActions, PlanActionTypes } from '../../plan/duck/actions';
import { StorageActions, StorageActionTypes } from '../../storage/duck/actions';
import { ClusterActions, ClusterActionTypes } from '../../cluster/duck/actions';
import { MigResource, ExtendedCoreNamespacedResource, CoreNamespacedResourceKind, ExtendedCoreNamespacedResourceKind, CoreClusterResource, CoreNamespacedResource, MigResourceKind } from '../../../client/resources';
import { ClientFactory } from '../../../client/client_factory';
import { IClusterClient } from '../../../client/client';
import Q from 'q';

export const StatusPollingInterval = 4000;
const ErrorToastTimeout = 5000;

const ControllerPodLabel = 'control-plane=controller-manager';
const VeleroPodLabel = 'component=velero';
const ResticPodLabel = 'name=restic';

enum LogKind {
  velero = 'velero',
  restic = 'restic',
  controller = 'controller'
}

enum ClusterKind {
  source = 'source',
  target = 'target',
  host = 'host',
}

interface ILog {
  podName: string;
  log: string;
}

type IMigrationClusterLogType = {
  [key in LogKind]?: ILog[];
};

interface IMigrationClusterLog extends IMigrationClusterLogType {
  clusterName: string;
}

type IMigrationLogs = {
  [key in ClusterKind]?: IMigrationClusterLog;
};

function* poll(action) {
  const params = { ...action.params };

  while (true) {
    try {
      const response = yield call(params.asyncFetch);
      const shouldContinue = params.callback(response);

      if (!shouldContinue) {
        throw new Error('Error while fetching data.');
      }
    } catch (e) {
      throw new Error(e);
    }
    yield delay(params.delay);
  }
}
function* watchPlanPolling() {
  while (true) {
    const action = yield take(PlanActionTypes.PLAN_POLL_START);
    yield race([call(poll, action), take(PlanActionTypes.PLAN_POLL_STOP)]);
  }
}

function* watchStoragePolling() {
  while (true) {
    const action = yield take(StorageActionTypes.STORAGE_POLL_START);
    yield race([call(poll, action), take(StorageActionTypes.STORAGE_POLL_STOP)]);
  }
}

function* watchClustersPolling() {
  while (true) {
    const action = yield take(ClusterActionTypes.CLUSTER_POLL_START);
    yield race([call(poll, action), take(ClusterActionTypes.CLUSTER_POLL_STOP)]);
  }
}

function* checkStatus(action) {
  const params = { ...action.params };
  while (true) {
    const generatorRes = yield call(params.asyncFetch);
    const pollingStatus = params.callback(generatorRes, params.statusItem);

    switch (pollingStatus) {
      case 'SUCCESS':
        yield put(PollingActions.stopStatusPolling());
        break;
      case 'FAILURE':
        yield put(PollingActions.stopStatusPolling());
        break;
      default:
        break;
    }
    yield delay(params.delay);
  }
}
function* watchStatusPolling() {
  while (true) {
    const data = yield take(PollingActionTypes.STATUS_POLL_START);
    yield race([call(checkStatus, data), take(PollingActionTypes.STATUS_POLL_STOP)]);
  }
}

export function* progressTimeoutSaga(action) {
  try {
    yield put(AlertActions.alertProgress(action.params));
    yield delay(5000);
    yield put(AlertActions.alertClear());
  } catch (error) {
    put(AlertActions.alertClear());
  }
}

export function* errorTimeoutSaga(action) {
  try {
    yield put(AlertActions.alertError(action.params));
    yield delay(ErrorToastTimeout);
    yield put(AlertActions.alertClear());
  } catch (error) {
    put(AlertActions.alertClear());
  }
}

export function* successTimeoutSaga(action) {
  try {
    yield put(AlertActions.alertSuccess(action.params));
    yield delay(5000);
    yield put(AlertActions.alertClear());
  } catch (error) {
    yield put(AlertActions.alertClear());
  }
}

function extractLogs(kind, pods, logAccum, migMeta, client, namespace = migMeta.namespace) {
  return pods.map(veleroPod => {
    const podName = veleroPod.metadata.name;
    const veleroLog = client.get(
      new ExtendedCoreNamespacedResource(
        CoreNamespacedResourceKind.Pod,
        namespace, // TODO: merge name
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
      }
    };

    const controllerPods = yield hostClient.list(
      new CoreNamespacedResource(CoreNamespacedResourceKind.Pod, migMeta.configNamespace),
      { labelSelector: ControllerPodLabel }
    );

    const controllerLogs = extractLogs(
      LogKind.controller,
      controllerPods.data.items,
      migrationLogs[ClusterKind.host],
      migMeta,
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
        migMeta,
        cluster.client
        );

      const resticLogs = extractLogs(
        LogKind.restic,
        cluster.restic.items,
        migrationLogs[clusterType],
        migMeta,
        cluster.client
      );

      return veleroLogs.concat(resticLogs);
    });
    yield Q.allSettled(logResults);

    console.error('Hey', migrationLogs);

  } catch (err) {
    throw err;
  }
}

function* watchLogsPolling() {
  while(true) {
    const action = yield take(PollingActionTypes.LOGS_POLL_START);
    yield race([call(collectLogs, action), take(PollingActionTypes.LOGS_POLL_STOP)]);
  }
}

function* watchAlerts() {
  yield takeLatest(AlertActionTypes.ALERT_PROGRESS_TIMEOUT, progressTimeoutSaga);
  yield takeLatest(AlertActionTypes.ALERT_ERROR_TIMEOUT, errorTimeoutSaga);
  yield takeLatest(AlertActionTypes.ALERT_SUCCESS_TIMEOUT, successTimeoutSaga);
}

export default {
  watchStoragePolling,
  watchClustersPolling,
  watchPlanPolling,
  watchStatusPolling,
  watchLogsPolling,
  watchAlerts,
};
