/** @jsx jsx */
import { jsx } from '@emotion/core';
import { Box, Flex, Text } from '@rebass/emotion';
import { css } from '@emotion/core';
import { Button } from '@patternfly/react-core';

const LogFooter = ({
  isFetchingLogs,
  log,
  downloadHandle,
  refreshLogs,
  ...props
}) => {
  return (<span>
    {isFetchingLogs ? null : (
      <Flex css={css`height: 5%;`}>
        <Box flex="0" mx="1em">
          <Button
            onClick={downloadHandle}
            isDisabled={!log}
            variant="primary">
            Download Selected Log
            </Button>
        </Box>
        <Box flex="0" mx="1em">
          <Button onClick={refreshLogs} variant="secondary">Refresh</Button>
        </Box>
      </Flex>
    )}
    </span>);
};

export default LogFooter;
