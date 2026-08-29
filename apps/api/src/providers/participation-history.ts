export interface ExternalParticipationHistoryRecord {
  phone: string;
  totalParticipations?: number;
  campaignEditions?: number[];
}

export interface ParticipationHistoryProvider {
  readonly name: string;
  getHistoryByPhones(phones: string[]): Promise<ExternalParticipationHistoryRecord[]>;
  healthCheck(): Promise<boolean>;
}
