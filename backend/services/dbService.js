import PendingAction from "../models/PendingAction.js";

export const getPendingAction = (workspaceId) =>
  PendingAction.findOne({ workspaceId });

export const savePendingAction = (workspaceId, payload) =>
  PendingAction.findOneAndUpdate(
    { workspaceId },
    payload,
    { upsert: true, new: true }
  );

export const clearPendingAction = (workspaceId) =>
  PendingAction.deleteOne({ workspaceId });
