import type { AppState } from './index';

export const selectAppState = (state: AppState) => ({
  apiKey: state.apiKey,
  fflogsUrl: state.fflogsUrl,
  fight: state.fight,
  actors: state.actors,
  selectedJob: state.selectedJob,
  selectedPlayerId: state.selectedPlayerId,
  mitEvents: state.mitEvents,
  castEvents: state.castEvents,
  isLoading: state.isLoading,
  isRendering: state.isRendering,
  error: state.error,
});

export const selectAppActions = (state: AppState) => ({
  setApiKey: state.setApiKey,
  setFflogsUrl: state.setFflogsUrl,
  setSelectedMitIds: state.setSelectedMitIds,
  loadFightMetadata: state.loadFightMetadata,
  setSelectedJob: state.setSelectedJob,
  setSelectedPlayerId: state.setSelectedPlayerId,
  loadEvents: state.loadEvents,
  loadEventsForPlayers: state.loadEventsForPlayers,
  addMitEvent: state.addMitEvent,
  setMitEvents: state.setMitEvents,
});

export const selectTimelineState = (state: AppState) => ({
  fight: state.fight,
  selectedJob: state.selectedJob,
  mitEvents: state.mitEvents,
  damageEvents: state.damageEvents,
  damageEventsByJob: state.damageEventsByJob,
  castEvents: state.castEvents,
});

export const selectTimelineActions = (state: AppState) => ({
  setMitEvents: state.setMitEvents,
  setIsRendering: state.setIsRendering,
});
