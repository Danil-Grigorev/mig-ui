import { IMigPlan, IMigMigration } from "../../../../client/resources/conversions";

export const PollingActionTypes = {
  STATUS_POLL_START: 'STATUS_POLL_START',
  STATUS_POLL_STOP: 'STATUS_POLL_STOP',
  LOGS_POLL_START: 'LOGS_POLL_START',
  LOGS_POLL_STOP: 'LOGS_POLL_STOP',
};


const startStatusPolling = (params?: any) => ({
  type: PollingActionTypes.STATUS_POLL_START,
  params,
});

const stopStatusPolling = () => ({
  type: PollingActionTypes.STATUS_POLL_STOP,
});

const startLogsPolling = (plan: IMigPlan, migrations: IMigMigration[]) => ({
  type: PollingActionTypes.LOGS_POLL_START,
  plan,
  migrations
});

const stopLogsPolling = () => ({
  type: PollingActionTypes.LOGS_POLL_STOP,
});

export const PollingActions = {
  startStatusPolling,
  stopStatusPolling,
  startLogsPolling,
  stopLogsPolling,
};
