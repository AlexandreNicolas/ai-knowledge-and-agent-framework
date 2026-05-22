export class UserPreferencesDto {
  userName?: string;
  interests?: string[];
  industry?: string;
  projectType?: string;
  companySize?: string;
}

export class AskCheesecakeDto {
  message: string;
  /** Sent by frontend to continue a conversation. If omitted, a new thread is used per request. */
  conversationId?: string;
  /** User preferences for personalized responses. */
  userPreferences?: UserPreferencesDto;
}
