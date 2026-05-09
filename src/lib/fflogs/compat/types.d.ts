export type FFlogsType = 'begincast' | 'cast';

export type FFlogsStance = {
  time: number;
  type: FFlogsType;
  actionName: string;
  actionId: number;
  sourceIsFriendly: boolean;
  url: string;
  window?: Array<number>;
  syncOnce?: boolean;
  battleOnce?: boolean;
  sourceID: number;
  duration?: number;
}[];

export interface FFlogsApiV1ReportEvents {
  ability: { name: string; guid: number; type: number; abilityIcon: string };
  fight: number;
  sourceID: number;
  sourceIsFriendly: boolean;
  sourceResources: {
    absorb: number;
    facing: number;
    hitPoints: number;
    maxHitPoints: number;
    mp: number;
    maxMP: number;
    tp: number;
    maxTP: number;
    x: number;
    y: number;
  };
  targetId: number;
  targetIsFriendly: boolean;
  targetResources: {
    facing: number;
    hitPoints: number;
    maxHitPoints: number;
    mp: number;
    maxMP: number;
    tp: number;
    maxTP: number;
    x: number;
    y: number;
  };
  timestamp: number;
  type: FFlogsType;
  duration?: number;
}

export interface FFLogsFight {
  id: number;
  start_time: number;
  end_time: number;
  name: string;
  zoneID?: number;
  boss?: number;
}

export interface ReportResponse {
  fights: FFLogsFight[];
  friendlies: {
    id: number;
    name: string;
    type: string;
    fights: { id: number }[];
  }[];
  enemies: {
    id: number;
    name: string;
    type: string;
    fights: { id: number }[];
  }[];
}
