import React from 'react';
import { connect } from 'react-redux';
import { Flex, Box } from '@rebass/emotion';
import {
  Page,
  PageSection,
} from '@patternfly/react-core';
import HeaderComponent from '../common/components/HeaderComponent';
import { Breadcrumb, BreadcrumbItem, BreadcrumbHeading } from '@patternfly/react-core';
import { Link } from "react-router-dom";

interface IProps {
}

const LogsComponent: React.FunctionComponent<IProps> = (props) => {
  return (
    <Page header={HeaderComponent}>
      <PageSection>
        <Flex justifyContent="center">
          <Box flex="0 0 100%">
            <Breadcrumb>
              <BreadcrumbItem>
                <Link to="/">Home</Link>
              </BreadcrumbItem>
              <BreadcrumbItem to="#" isActive>Section Title</BreadcrumbItem>
            </Breadcrumb>
          </Box>
        </Flex>
      </PageSection>
      <PageSection>
        <Flex justifyContent="center">
          <Box flex="0 0 100%">
            logs here
          </Box>
        </Flex>
      </PageSection>
      <PageSection>
        {/* <TODO: footer content */}
      </PageSection>
    </Page>
  );
};

export default connect(
  state => ({
  }),
  dispatch => ({
  })
)(LogsComponent);
