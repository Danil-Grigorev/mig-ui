/** @jsx jsx */
import { jsx } from '@emotion/core';
import {
  useEffect,
  useContext,
  useState,
  FunctionComponent} from 'react';
import { connect } from 'react-redux';
import { Modal } from '@patternfly/react-core';
import { PollingContext, PlanContext } from '../../../home/duck/context';
import styled from '@emotion/styled';
import { IMigrationLogs, ClusterKind, LogKind, ILog, IMigrationClusterLog } from '../../duck/sagas';
import { PlanActions } from '../../duck';
import { IMigPlan, IMigMigration } from '../../../../client/resources/conversions';
import LogHeader from './LogHeader';
import LogBody from './LogBody';
import LogFooter from './LogFooter';

interface IProps {
  isOpen: boolean;
  isFetchingLogs: boolean;
  plan: IMigPlan;
  migrations: IMigMigration[];
  logs: IMigrationLogs;
  onHandleClose: () => void;
  refreshLogs: (plan: IMigPlan, migrations: IMigMigration[]) => void;
}

const LogsModal: FunctionComponent<IProps> = ({
  isOpen,
  onHandleClose,
  isFetchingLogs,
  refreshLogs,
  plan,
  migrations,
  logs
}) => {
  const [cluster, setCluster] = useState({
    label: 'host',
    value: 'host'
  });
  const [podType, setPodType] = useState({
    label: null,
    value: '?'
  });
  const [podIndex, setPodIndex] = useState({
    label: null,
    value: -1
  });
  const [log, setLog] = useState('');

  const pollingContext = useContext(PollingContext);
  const planContext = useContext(PlanContext);

  useEffect(() => {
    if (isOpen) {
      pollingContext.stopAllPolling();
      planContext.stopDataListPolling();
    }
  });

  const downloadLogHandle = (clusterType, podLogType, logIndex) => {
    const element = document.createElement('a');
    const podName = logs[clusterType][podLogType][logIndex].podName;
    const file = new Blob([logs[clusterType][podLogType][logIndex].log], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${clusterType}-${podName}.log`;
    document.body.appendChild(element);
    element.click();
  };

  const downloadJsonHandle = (resource: IMigPlan | IMigMigration) => {
    const element = document.createElement('a');
    const file = new Blob([JSON.stringify(resource, null, 2)], { type: 'application/json' });
    element.href = URL.createObjectURL(file);
    element.download = `${resource.metadata.name}.json`;
    document.body.appendChild(element);
    element.click();
  };

  const downloadAllHandle = () => {
    console.error(logs);
    downloadJsonHandle(logs.plan);
    logs.migrations.map(migration => {
      downloadJsonHandle(migration);
    });
    Object.keys(logs)
      .filter(clName => Object.values(ClusterKind).includes(clName))
      .map((clName) => Object.keys(logs[clName])
        .filter(pType => Object.values(LogKind).includes(pType))
        .map(logPodType => logs[clName][logPodType]
          .map((_, logPodIndex) =>
            downloadLogHandle(clName, logPodType, logPodIndex))));
  };

  const onClose = () => {
    pollingContext.startAllDefaultPolling();
    planContext.startDefaultDataListPolling();
    onHandleClose();
  };

  const modalTitle = `Plan Logs - "${plan.metadata.name}"`;

  const StyledModal = styled(Modal)`
    margin: 1em 0 1em 0;
    height: 90%;
  `;

  return (
    <StyledModal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}>
      <LogHeader
        logs={logs}
        isFetchingLogs={isFetchingLogs}
        cluster={cluster}
        podType={podType}
        podIndex={podIndex}
        log={log}
        setCluster={setCluster}
        setPodType={setPodType}
        setPodIndex={setPodIndex}
        setLog={setLog}
      />
      <LogBody
        isFetchingLogs={isFetchingLogs}
        log={log}
        downloadAllHandle={downloadAllHandle}/>
      <LogFooter
        isFetchingLogs={isFetchingLogs}
        log={log}
        downloadHandle={() => downloadLogHandle(cluster.label, podType.label, podIndex.label)}
        cluster={cluster}
        podType={podType}
        podIndex={podIndex}
        refreshLogs={() => refreshLogs(plan, migrations)}/>
    </StyledModal>
  );
};

export default connect(
  state => {
    return {
      logs: state.plan.logs,
      migrations: state.plan.logs.migrations,
      isFetchingLogs: state.plan.isFetchingLogs,
    };
  },
  dispatch => {
    return {
      refreshLogs: (plan, migrations) => dispatch(PlanActions.logsFetchRequest(plan, migrations))
    };
  }
)(LogsModal);
