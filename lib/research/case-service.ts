import 'server-only';
import { withDatabase } from '../workspace/db';
import { appendCaseVersion, createCase, listCases, parseCreateCase, parseVersionInput, readCase } from './case-core';
import { identity } from './service';

export async function createStrategyCase(value:unknown) {
  const user = await identity(); const input = parseCreateCase(value);
  return withDatabase(client => createCase(client, user, input), true);
}
export async function saveStrategyCaseVersion(id:string, value:unknown) {
  const user = await identity(); const input = parseVersionInput(value);
  return withDatabase(client => appendCaseVersion(client, user, id, input), true);
}
export async function listStrategyCases(propertyId?:string) {
  await identity();
  if (propertyId !== undefined && !/^reapi:[\w-]{1,80}$/.test(propertyId)) return [];
  return withDatabase(client => listCases(client, {propertyId}));
}
export async function getStrategyCase(id:string) {
  await identity();
  return withDatabase(client => readCase(client, id));
}
