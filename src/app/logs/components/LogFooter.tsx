/** @jsx jsx */
import { jsx } from '@emotion/core';
import { Box, Flex, Text } from '@rebass/emotion';
import { css } from '@emotion/core';
import { Button, CardFooter } from '@patternfly/react-core';

const LogFooter = ({
  isFetchingLogs,
  log,
  downloadHandle,
  requestReport,
}) => {
  return (<CardFooter style={{ height: '5%' }}>
    {isFetchingLogs ? null : (
      <Flex>
        <Box flex="0" mx="1em">
          <Button
            onClick={downloadHandle}
            isDisabled={log.length === 0}
            variant="primary">
            Download Selected
              </Button>
        </Box>
        <Box flex="0" mx="1em">
          <Button onClick={requestReport} variant="secondary">Refresh</Button>
        </Box>
      </Flex>
    )}
  </CardFooter>);
};

export default LogFooter;
