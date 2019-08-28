/** @jsx jsx */
import { jsx } from '@emotion/core';
import { useEffect, useContext, useState } from 'react';
import { connect } from 'react-redux';
import { Modal, TextArea, FormSelect } from '@patternfly/react-core';
import { PollingContext } from '../../../home/duck/context';
import { AddEditMode, defaultAddEditStatus } from '../../../common/add_edit_state';
import Select from 'react-select';
import styled from '@emotion/styled';
import { IMigrationLogs, ClusterKind, LogKind, ILog } from '../../duck/sagas';
import { Box, Flex, Text } from '@rebass/emotion';
import Loader from 'react-loader-spinner';
import theme from '../../../../theme';
import { css } from '@emotion/core';

const LogsModal = ({
  isOpen,
  onHandleClose,
  isFetchingLogs,
  logs,
  ...props
}) => {
  const pollingContext = useContext(PollingContext);
  const [cluster, setCluster] = useState({
    label: 'host',
    value: 'host'
  });
  const [logSource, setLogSource] = useState({
    label: '?',
    value: '?'
  });
  const [podIndex, setPodIndex] = useState({
    label: '?',
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

  const pods = logs[cluster.value] && logs[cluster.value][logSource.value] ?
    Object.values(logs[cluster.value][logSource.value])
    .map((pod: ILog, index: number) => {
      return {
        label: pod.podName,
        value: index,
      };
    }) : [];

  useEffect(() => {
    if (isOpen) {
      pollingContext.stopAllPolling();
    }
  });

  const onClose = () => {
    pollingContext.startAllDefaultPolling();
    onHandleClose();
  };


  const modalTitle = 'Plan logs';

  const StyledModal = styled(Modal)`
    margin: 1em 0 1em 0;
    width: 80%;
    height: 80%;
  `;
  const StyledText = styled(TextArea)`
    margin: 1em 0 1em 0;
    height: 90%;
  `;
  return (
    <StyledModal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}>
      {isFetchingLogs ?
        null
        : (<Select
          name="selectCluster"
          value={cluster}
          onChange={clusterSelected => {
            setCluster(clusterSelected);
            setLogSource({
              label: '?',
              value: '?'
            });
            setPodIndex({
              label: '?',
              value: -1
            });
          }}
          options={clusters}
        />)}
      {isFetchingLogs ?
        null
        : (<Select
          name="selectLogSource"
          value={logSource}
          onChange={logSourceSelected => {
            setLogSource(logSourceSelected);
            setPodIndex({
              label: '?',
              value: -1
            });
          }}
          options={logSources}
        />)}
      {isFetchingLogs ?
        null
        : (<Select
          name="selectPod"
          value={podIndex}
          onChange={pod => {
            setPodIndex(pod);
            setLog(logs[cluster.value][logSource.value][0].log);
          }}
          options={pods}
        />)}
      {isFetchingLogs ? (
        <Flex
        css={css`
            height: 100%;
            text-align: center;
          `}>
        <Box flex="1" m="auto">
          <Loader type="ThreeDots" color={theme.colors.navy} height="100" width="100" />
          <Text fontSize={[2, 3, 4]}>Fetching logs</Text>
        </Box>
      </Flex>)
        : log === '' ?
          <Flex
            css={css`
            height: 100%;
            text-align: center;
          `}>
            <Box flex="1" m="auto">
              <Text fontSize={[2, 3, 4]}>Nothing to display</Text>
            </Box>
          </Flex> : (<StyledText height={'90%'} id="logArea" value={log} />)}
    </StyledModal>
  );
};

export default connect(
  state => {
    return {
      logs: state.plan.logs,
      plan: state.plan.logs.plan,
      migrations: state.plan.logs.migrations,
      isFetchingLogs: state.plan.isFetchingLogs,
    };
  },
)(LogsModal);
