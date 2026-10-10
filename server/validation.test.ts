import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMessage, RateLimit} from './validation.ts';
import {neutralInput} from './physics.ts';

test('strict messages reject malformed JSON, arrays, extra fields and non-boolean inputs', () => {
  for (const value of [
    'null', '[]', '{', '{}', '{"type":"fake"}', '{"type":"leave","extra":1}',
    '{"type":"join","code":"../../"}', '{"type":"input","input":{}}',
    JSON.stringify({type: 'input', input: {...neutralInput(), left: 1}}),
    JSON.stringify({type: 'input', input: {...neutralInput(), extra: false}}),
  ]) assert.equal(parseMessage(value), null, value);
  assert.deepEqual(parseMessage('{"type":"join","code":"abc234"}'), {type: 'join', code: 'ABC234'});
  assert.deepEqual(parseMessage(JSON.stringify({type: 'input', input: neutralInput()})),
    {type: 'input', input: neutralInput()});
  assert.deepEqual(parseMessage('{"type":"queue"}'), {type: 'queue'});
});

test('token buckets bound bursts and refill at the configured rate', () => {
  const limit = new RateLimit(2, 1, 0);
  assert.equal(limit.take(0), true);
  assert.equal(limit.take(0), true);
  assert.equal(limit.take(0), false);
  assert.equal(limit.take(500), false);
  assert.equal(limit.take(1000), true);
  assert.equal(limit.take(1000), false);
  assert.equal(limit.take(10000), true);
  assert.equal(limit.take(10000), true);
  assert.equal(limit.take(10000), false);
});
