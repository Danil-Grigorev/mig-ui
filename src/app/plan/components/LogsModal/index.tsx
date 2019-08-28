/** @jsx jsx */
import { jsx } from '@emotion/core';
import { useEffect, useContext, useState, useRef, useLayoutEffect, Suspense, lazy} from 'react';
import { connect } from 'react-redux';
import { Modal, TextArea, FormSelect, Button } from '@patternfly/react-core';
import { PollingContext, PlanContext } from '../../../home/duck/context';
import { AddEditMode, defaultAddEditStatus } from '../../../common/add_edit_state';
import Select from 'react-select';
import styled from '@emotion/styled';
import { IMigrationLogs, ClusterKind, LogKind, ILog, IMigrationClusterLog } from '../../duck/sagas';
import { Box, Flex, Text } from '@rebass/emotion';
import Loader from 'react-loader-spinner';
import theme from '../../../../theme';
import { css } from '@emotion/core';
import { PlanActions } from '../../duck';

const LogsModal = ({
  isOpen,
  onHandleClose,
  isFetchingLogs,
  refreshLogs,
  plan,
  migrations,
  ...props
}) => {
  const logs: IMigrationLogs = props.logs;
  const pollingContext = useContext(PollingContext);
  const planContext = useContext(PlanContext);
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

  const clusters = Object.keys(logs)
    .filter(cl => Object.values(ClusterKind).includes(cl))
    .map(cl => {
      return {
        label: cl,
        value: cl,
      };
    });

  const logSources = logs[cluster.value] ? Object.keys(logs[cluster.value])
    .filter(ls => Object.values(LogKind).includes(ls))
    .map(ls => {
      return {
        label: ls,
        value: ls,
      };
    }) : [];

  const pods = logs[cluster.value] && logs[cluster.value][podType.value] ?
    Object.values(logs[cluster.value][podType.value])
    .map((pod: ILog, index) => {
      return {
        label: pod.podName,
        value: index,
      };
    }) : [];

  useEffect(() => {
    if (isOpen) {
      pollingContext.stopAllPolling();
      planContext.stopDataListPolling();
    }
  });

  const downloadHandle = (clusterType, podLogType, logIndex) => {
    const element = document.createElement('a');
    const podName = logs[clusterType][podLogType][logIndex].podName;
    const file = new Blob([logs[clusterType][podLogType][logIndex].log], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${clusterType}-${podName}.log`;
    document.body.appendChild(element);
    element.click();
  };

  const downloadAllHandle = () => {
    Object.keys(logs)
      .filter(clName => Object.values(ClusterKind).includes(clName))
      .map((clName) => Object.keys(logs[clName])
        .filter(pType => Object.values(LogKind).includes(pType))
        .map(logPodType => logs[clName][logPodType]
          .map((_, logPodIndex) =>
            downloadHandle(clName, logPodType, logPodIndex))));
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
  const LogItem = lazy(() => import('./LogItem'));
  return (
    <StyledModal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}>
      {isFetchingLogs ?
        null
        :
        (<Flex css={css`height: 10%;`}>
          <Box mx="3em" flex="auto">
            <Text>Select Cluster</Text>
            <Select
              name="selectCluster"
              value={cluster}
              onChange={clusterSelected => {
                setCluster(clusterSelected);
                setPodType({
                  label: null,
                  value: '?'
                });
                setPodIndex({
                  label: null,
                  value: -1
                });
                setLog('');
              }}
              options={clusters}
            />
          </Box>
          <Box mx="3em" flex="auto">
            <Text>Select Log Source</Text>
            <Select
              name="selectLogSource"
              value={podType}
              onChange={logSourceSelected => {
                setPodType(logSourceSelected);
                setPodIndex({
                  label: null,
                  value: -1
                });
                setLog('');
              }}
              options={logSources}
              />
          </Box>
          <Box mx="3em" flex="auto">
            <Text>Select Pod Source</Text>
            <Select
              name="selectPod"
              value={podIndex}
              onChange={pod => {
                setPodIndex(pod);
                setLog(logs[cluster.value][podType.value][0].log);
              }}
              options={pods}
              />
          </Box>
        </Flex>)}
      <Flex css={css`height: 80%; text-align: center; margin: 1em;`}>
      {isFetchingLogs ? (
        <Box flex="1" m="auto">
          <Loader type="ThreeDots" color={theme.colors.navy} height="100" width="100" />
            <Text fontSize={[2, 3, 4]}>Fetching logs</Text>
        </Box>)
        : log === '' ? (
            <Box flex="1" m="auto">
              <Text fontSize={[2, 3, 4]}>Select pod to display logs</Text>
              <Text fontSize={[2, 3, 4]}>or</Text>
              <Button onClick={() => downloadAllHandle()} variant="primary">Download All Logs</Button>
            </Box>)
            : (<Suspense fallback={<div>Loading</div>}>
                <LogItem log={log} />
              </Suspense>)
        }
      </Flex>
      {isFetchingLogs ? null
        : (
          <Flex css={css`height: 5%;`}>
            <Box flex="0" mx="1em">
              <Button
                onClick={() => downloadHandle(cluster.label, podType.label, podIndex.value)}
                isDisabled={!log}
                variant="primary">
                Download Selected Log
          </Button>
            </Box>
            <Box flex="0" mx="1em">
              <Button onClick={() => refreshLogs(plan, migrations)} variant="primary">Refresh</Button>
            </Box>
          </Flex>) }
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
