/** @jsx jsx */
import { jsx } from '@emotion/core';
import React, { useState, useContext } from 'react';
import { PlanContext, PollingContext } from '../../../duck/context';
import { Button, Dropdown, DropdownItem, KebabToggle } from '@patternfly/react-core';
import { useOpenModal } from '../../../duck/hooks';
import { Flex, Box } from '@rebass/emotion';
import PlanStatus from './PlanStatus';
import MigrateModal from '../../../../plan/components/MigrateModal';
import theme from '../../../../../theme';
import Loader from 'react-loader-spinner';
import { css } from '@emotion/core';
import LogsModal from '../../../../plan/components/LogsModal';
import { Link } from "react-router-dom";

const PlanActions = ({ plan, isLoading, isClosing }) => {
  const [isOpen, toggleOpen] = useOpenModal(false);
  const [isLogsViewOpen, toggleLogsViewOpen] = useOpenModal(false);
  const planContext = useContext(PlanContext);
  const {
    hasClosedCondition,
    hasReadyCondition,
    hasErrorCondition,
    hasRunningMigrations,
    hasAttemptedMigration,
    hasSucceededMigration,
    finalMigrationComplete,
  } = plan.PlanStatus;

  const [kebabIsOpen, setKebabIsOpen] = useState(false);
  const kebabDropdownItems = [
    <DropdownItem
      // @ts-ignore
      onClick={() => {
        planContext.handleDeletePlan(plan);
        setKebabIsOpen(false);
      }}
      key="deletePlan"
      isDisabled={isClosing}
    >
      Delete
    </DropdownItem>,
    <DropdownItem
      key="showLogs"
      isDisabled={isClosing}
    // onClick={() => {
    //   planContext.logsFetchRequest(plan.MigPlan, plan.Migrations);
    //   setKebabIsOpen(false);
    //   toggleLogsViewOpen();
    // }}>
    >
      <Link to="/logs">Logs</Link>

    </DropdownItem>,
  ];

  return (
    <Flex>
      <Box m="auto auto auto 0">
        <PlanStatus plan={plan} isClosing={isClosing} />
      </Box>
      <Box mx={1}>
        <Button
          isDisabled={
            hasClosedCondition ||
            !hasReadyCondition ||
            hasErrorCondition ||
            hasRunningMigrations ||
            hasAttemptedMigration ||
            finalMigrationComplete ||
            isLoading
          }
          variant="primary"
          onClick={() => {
            planContext.handleStageTriggered(plan);
          }}
        >
          Stage
        </Button>
      </Box>
      <Box mx={1}>
        <Button
          isDisabled={
            hasClosedCondition ||
            !hasReadyCondition ||
            hasErrorCondition ||
            hasRunningMigrations ||
            finalMigrationComplete ||
            isLoading
          }
          variant="primary"
          onClick={toggleOpen}
        >
          Migrate
        </Button>
        <MigrateModal plan={plan} isOpen={isOpen} onHandleClose={toggleOpen} />
      </Box>

      <Box mx={1}>
        <Dropdown
          toggle={<KebabToggle
            onToggle={() => setKebabIsOpen(!kebabIsOpen)}
          />}
          isOpen={kebabIsOpen}
          isPlain
          dropdownItems={kebabDropdownItems}
        />
      </Box>
      <LogsModal plan={plan.MigPlan} isOpen={isLogsViewOpen} onHandleClose={toggleLogsViewOpen} />

      {isLoading && (
        <Box
          css={css`
            height: 100%;
            text-align: center;
            margin: auto 4px auto 4px;
            width: 1em;
          `}
        >
          <Loader type="ThreeDots" color={theme.colors.navy} height="100%" width="100%" />
        </Box>
      )}
    </Flex>
  );
};

export default PlanActions;
