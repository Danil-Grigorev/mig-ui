

/** @jsx jsx */
import { jsx } from '@emotion/core';
import { useRef, useLayoutEffect, lazy} from 'react';
import { TextArea } from '@patternfly/react-core';
import theme from '../../../../theme';
import styled from '@emotion/styled';

const LogItem = ({log}) => {

  const StyledTextArea = styled(TextArea)`
    height: 100%;
    color: ${theme.colors.lightGray1};
    background: #222;
  `;

  const handleScroll = (ev) => console.error(ev.currentTarget);

  return (
    <StyledTextArea id="logArea" value={log} onScroll={handleScroll}/>
  );
};

export default LogItem;
