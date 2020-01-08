/** @jsx jsx */
import { jsx } from '@emotion/core';
import { FunctionComponent } from 'react';
import { Box, Flex, Text } from '@rebass/emotion';
import Select from 'react-select';
import { CardHeader } from '@patternfly/react-core';
import { IPlanLogSources, IPodLogSource } from '../../../client/resources/convension';

interface ISelectItem {
  label: any;
  value: any;
}

interface IProps {
  isFetchingLogs: boolean;
  report: IPlanLogSources;
  cluster: ISelectItem;
  podIndex: ISelectItem;
  setCluster: (itemISelectItem) => void;
  setPodIndex: (itemISelectItem) => void;
  requestLog: (string) => void;
}

const LogHeader: FunctionComponent<IProps> = ({
  isFetchingLogs,
  report,
  cluster,
  podIndex,
  setCluster,
  setPodIndex,
  requestLog
}) => {
  const clusters = Object.keys(report)
    .map(cl => {
      return {
        label: cl,
        value: cl,
      };
    });

  const pods = report && report[cluster.value] ? report[cluster.value]
    .map((pod: IPodLogSource, index) => {
      return {
        label: pod.name,
        value: index,
      };
    }) : [];

  return (<span>
    {isFetchingLogs ? null : (
      <CardHeader style={{ height: '10%' }}>
        <Flex>
          <Box mx="3em" width={1 / 2} flex="auto">
            <Text>Select Cluster</Text>
            <Select
              name="selectCluster"
              value={cluster}
              onChange={clusterSelected => {
                setCluster(clusterSelected);
                setPodIndex({
                  label: null,
                  value: -1
                });
              }}
              options={clusters}
            />
          </Box>
          <Box mx="3em" width={1 / 2} flex="auto">
            <Text>Select Pod Source</Text>
            <Select
              name="selectPod"
              value={podIndex}
              onChange={pod => {
                setPodIndex(pod);
                requestLog(report[cluster.value][pod.value].log);
              }}
              options={pods}
            />
          </Box>
        </Flex>
      </CardHeader>)
    }
  </span>);
};

export default LogHeader;
