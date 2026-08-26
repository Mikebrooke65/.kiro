import { supabase } from './supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

export class ApiError extends Error {
  /**
   * Optional machine-readable code from the failing endpoint's response body
   * (e.g. `redeem-invite`'s `reason` field), additive and backward
   * compatible — every existing `new ApiError(message)` call site across the
   * codebase still works unchanged with this left `undefined`. Lets a caller
   * distinguish a specific, first-class outcome (like
   * `.kiro/specs/streamlined-invites-and-child-access/` Requirement 6.1's
   * "bounce to Manager") from a generic failure, without parsing message text.
   */
  readonly reason?: string;

  constructor(message: string, reason?: string) {
    super(message);
    this.name = 'ApiError';
    this.reason = reason;
  }
}

interface QueryOptions {
  select?: string;
  match?: Record<string, any>;
  order?: { column: string; ascending: boolean };
  limit?: number;
}

export class ApiClient {
  protected supabase: SupabaseClient;

  constructor() {
    this.supabase = supabase;
  }

  async query<T>(table: string, options?: QueryOptions): Promise<T[]> {
    let query = this.supabase.from(table).select(options?.select || '*');

    if (options?.match) {
      query = query.match(options.match);
    }

    if (options?.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending });
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw new ApiError(error.message);
    return data as T[];
  }

  async queryOne<T>(table: string, id: string): Promise<T> {
    const { data, error } = await this.supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new ApiError(error.message);
    return data as T;
  }

  async insert<T>(table: string, record: Partial<T>): Promise<T> {
    const { data, error } = await this.supabase
      .from(table)
      .insert(record)
      .select()
      .single();

    if (error) throw new ApiError(error.message);
    return data as T;
  }

  async update<T>(table: string, id: string, updates: Partial<T>): Promise<T> {
    const { data, error } = await this.supabase
      .from(table)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new ApiError(error.message);
    return data as T;
  }

  async delete(table: string, id: string): Promise<void> {
    const { error } = await this.supabase.from(table).delete().eq('id', id);

    if (error) throw new ApiError(error.message);
  }
}
