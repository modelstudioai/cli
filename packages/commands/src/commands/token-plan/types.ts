export interface TokenPlanSeatEquity {
  EquityType?: string;
  CycleInstanceId?: string;
  CycleStartTime?: number;
  CycleEndTime?: number;
  CycleTotalValue?: number;
  CycleSurplusValue?: number;
  CycleVersion?: number;
}

export interface TokenPlanSeatDetail {
  InstanceCode?: string;
  EquityList?: TokenPlanSeatEquity[];
  EndTime?: number;
  SeatId?: string;
  SpecType?: string;
  StartTime?: number;
  AssignedStatus?: string;
  AccountId?: string;
  AccountName?: string;
  AccountEmail?: string;
  Status?: string;
}

export interface GetSubscriptionSeatDetailsResponse {
  Success?: boolean;
  Code?: string;
  Message?: string;
  Data?: {
    Items?: TokenPlanSeatDetail[];
    Total?: number;
    PageNo?: number;
    PageSize?: number;
  };
}

export interface CreateTokenPlanKeyResponse {
  Success?: boolean;
  Code?: string;
  Message?: string;
  Data?: {
    ApiKeyId?: string;
    PlainApiKey?: string;
    MaskedApiKey?: string;
    Description?: string;
    CreatedAt?: string;
    SourceId?: string;
  };
}

export interface BatchAssignSeatsResponse {
  Success?: boolean;
  Code?: string;
  Message?: string;
}

export interface AddOrganizationMemberResponse {
  Success?: boolean;
  Code?: string;
  Message?: string;
  RequestId?: string;
  HttpStatusCode?: number;
  Data?: {
    AccountId?: string;
    SeatAssigned?: boolean;
  };
}
