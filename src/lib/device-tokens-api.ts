import { ApiClient, ApiError } from './api-client';

export interface DeviceToken {
  id: string;
  user_id: string;
  token: string;
  platform: 'ios' | 'android';
  created_at: string;
  updated_at: string;
}

export class DeviceTokensApi extends ApiClient {
  /** Register (or refresh) a device's push notification token for the current user */
  async registerToken(token: string, platform: 'ios' | 'android'): Promise<DeviceToken> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new ApiError('Not authenticated');

    const { data, error } = await this.supabase
      .from('device_tokens')
      .upsert(
        {
          user_id: user.id,
          token,
          platform,
        },
        { onConflict: 'token' }
      )
      .select()
      .single();

    if (error) throw new ApiError(error.message);
    return data as DeviceToken;
  }

  /** Remove a device token, e.g. on logout so this device stops receiving pushes for this user */
  async removeToken(token: string): Promise<void> {
    const { error } = await this.supabase
      .from('device_tokens')
      .delete()
      .eq('token', token);

    if (error) throw new ApiError(error.message);
  }
}

export const deviceTokensApi = new DeviceTokensApi();
