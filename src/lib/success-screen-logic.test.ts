/**
 * Unit tests for the Adult self-declaration helpers added to
 * `success-screen-logic.ts`.
 *
 * Spec: `.kiro/specs/add-player-and-dob-age-model/` (task 11)
 * _Requirements: 3.4, 4.6_
 *
 * Run: npm test
 */

import { describe, expect, it } from 'vitest';

import {
  needsAdultSelfDeclaration,
  needsCaregiverSubjectDetails,
  describeIntendedRole,
  isValidDateOfBirth,
  resolvePrimaryActionHref,
} from './success-screen-logic';

describe('needsAdultSelfDeclaration (Requirement 3.4, 4.6)', () => {
  it('is true for player/coach/manager intended roles', () => {
    expect(needsAdultSelfDeclaration('player')).toBe(true);
    expect(needsAdultSelfDeclaration('coach')).toBe(true);
    expect(needsAdultSelfDeclaration('manager')).toBe(true);
  });

  it('is false only for a caregiver intended role', () => {
    expect(needsAdultSelfDeclaration('caregiver')).toBe(false);
  });

  it('defaults to true for a null/undefined/unrecognized role, matching the server default to player', () => {
    expect(needsAdultSelfDeclaration(null)).toBe(true);
    expect(needsAdultSelfDeclaration(undefined)).toBe(true);
    expect(needsAdultSelfDeclaration('admin')).toBe(true);
    expect(needsAdultSelfDeclaration('')).toBe(true);
  });
});

describe('needsCaregiverSubjectDetails (streamlined-invites-and-child-access Requirement 5.2/5.3)', () => {
  it('is true only for a caregiver intended role', () => {
    expect(needsCaregiverSubjectDetails('caregiver')).toBe(true);
  });

  it('is false for player/coach/manager and for a null/undefined/unrecognized role', () => {
    expect(needsCaregiverSubjectDetails('player')).toBe(false);
    expect(needsCaregiverSubjectDetails('coach')).toBe(false);
    expect(needsCaregiverSubjectDetails('manager')).toBe(false);
    expect(needsCaregiverSubjectDetails(null)).toBe(false);
    expect(needsCaregiverSubjectDetails(undefined)).toBe(false);
    expect(needsCaregiverSubjectDetails('')).toBe(false);
  });

  it('is always the opposite of needsAdultSelfDeclaration', () => {
    for (const role of ['player', 'coach', 'manager', 'caregiver', null, undefined, '', 'admin']) {
      expect(needsCaregiverSubjectDetails(role)).toBe(!needsAdultSelfDeclaration(role));
    }
  });
});

describe('describeIntendedRole (Requirement 2.2)', () => {
  it('labels the three team roles and caregiver', () => {
    expect(describeIntendedRole('coach')).toBe('Coach');
    expect(describeIntendedRole('manager')).toBe('Manager');
    expect(describeIntendedRole('player')).toBe('Player');
    expect(describeIntendedRole('caregiver')).toBe('Caregiver');
  });

  it('defaults to "Player" for a null/undefined/unrecognized role, matching the server default', () => {
    expect(describeIntendedRole(null)).toBe('Player');
    expect(describeIntendedRole(undefined)).toBe('Player');
    expect(describeIntendedRole('admin')).toBe('Player');
    expect(describeIntendedRole('')).toBe('Player');
  });
});

describe('isValidDateOfBirth', () => {
  const REFERENCE = new Date(2025, 5, 15); // 2025-06-15

  it('accepts a real past calendar date', () => {
    expect(isValidDateOfBirth('2000-01-01', REFERENCE)).toBe(true);
  });

  it('accepts exactly today', () => {
    expect(isValidDateOfBirth('2025-06-15', REFERENCE)).toBe(true);
  });

  it('rejects a future date', () => {
    expect(isValidDateOfBirth('2025-06-16', REFERENCE)).toBe(false);
  });

  it('rejects an empty or malformed value', () => {
    expect(isValidDateOfBirth('', REFERENCE)).toBe(false);
    expect(isValidDateOfBirth('not-a-date', REFERENCE)).toBe(false);
  });

  it('rejects a calendar-invalid date rather than letting it roll over', () => {
    expect(isValidDateOfBirth('2024-02-30', REFERENCE)).toBe(false);
  });
});

describe('resolvePrimaryActionHref (Requirement 8.2)', () => {
  it('routes to the Team roster when a request is pending, even with an appUrl set', () => {
    // streamlined-invites-and-child-access, Decision 1: the destination
    // moved from the retired dedicated Approvals page to /team, where the
    // pending child's roster row now carries the Accept/Deny action.
    expect(resolvePrimaryActionHref(true, 'https://club.example.com')).toBe('/team');
    expect(resolvePrimaryActionHref(true, null)).toBe('/team');
  });

  it('falls back to the branded appUrl when nothing is pending', () => {
    expect(resolvePrimaryActionHref(false, 'https://club.example.com')).toBe(
      'https://club.example.com'
    );
    expect(resolvePrimaryActionHref(undefined, 'https://club.example.com')).toBe(
      'https://club.example.com'
    );
  });

  it('falls back to /login when nothing is pending and there is no appUrl', () => {
    expect(resolvePrimaryActionHref(false, null)).toBe('/login');
    expect(resolvePrimaryActionHref(undefined, null)).toBe('/login');
  });
});
