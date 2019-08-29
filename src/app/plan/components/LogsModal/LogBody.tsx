/** @jsx jsx */
import { jsx } from '@emotion/core';
import { lazy, Suspense} from 'react';
import theme from '../../../../theme';
import { Box, Flex, Text } from '@rebass/emotion';
import { css } from '@emotion/core';
import Loader from 'react-loader-spinner';
import { Button } from '@patternfly/react-core';

const LogItem = lazy(() => import('./LogItem'));

const LogBody = ({
  isFetchingLogs,
  log,
  downloadAllHandle,
  ...props
}) => {
  return (
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
            <Button onClick={downloadAllHandle} variant="primary">Download Logs</Button>
          </Box>)
          : (<Suspense fallback={<div>Loading</div>}>
            <LogItem log={log} />
          </Suspense>)
      }
    </Flex>);
};

export default LogBody;
