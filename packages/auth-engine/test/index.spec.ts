import assert from 'node:assert';
import { describe, it } from "node:test";
import { AuthEngine, defaultAuthEngine } from "../src/index.js";
import { InvalidArgumentsError } from '@socket-mesh/errors';
import jwt from 'jsonwebtoken';

describe('AuthEngine', () => {
  const authEngine = defaultAuthEngine({ authKey: 'secret' });

  describe('verifyToken', () => {
    it('should return a Promise<string | JwtPayload>', async () => {
      const signedToken = jwt.sign({ sub: '123' }, 'secret');
      const result = await authEngine.verifyToken(signedToken, { complete: true });
      assert(result instanceof Object);
    });

    it('should throw an InvalidArgumentsError when signedToken is not a string', async () => {
      const result = authEngine.verifyToken(123 as any, { complete: true });
      await assert.rejects(result, InvalidArgumentsError);
    });
  });

  describe('signToken', () => {
    it('should return a Promise<string | undefined>', async () => {
      const token = { sub: '123' };
      const result = await authEngine.signToken(token, { expiresIn: '1h' });
      assert(typeof result === 'string');
    });
  });
});
