import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import localStorage from '../src/index.js';

describe('LocalStorage', () => {
	beforeEach(async () => {
		localStorage.clear();
	});

	it('should not return prototypical things', () => {
		assert.strictEqual(localStorage.getItem('key'), null);
	});

	it('should not make assuptions about key positioning', () => {
		localStorage.setItem('a', '1');
		assert.strictEqual(localStorage.key(0), 'a');
	});

	it('should report the correct length', () => {
		localStorage.setItem('a', '1');
		localStorage.setItem('b', '2');
		assert.strictEqual(localStorage.getItem('a'), '1');
		assert.strictEqual(localStorage.getItem('b'), '2');
		assert.strictEqual(localStorage.length, 2);
	});

	it('should return the correct values for undefined items.', () => {
		assert.strictEqual(localStorage['c'], undefined);
		assert.strictEqual(localStorage.getItem('c'), null);
	});

	it('should return "undefined" for values that are set to undefined.', () => {
		localStorage.setItem('a', '1');
		localStorage.setItem('b', '2');
		localStorage.setItem('c', undefined as any);
		assert.strictEqual(localStorage.getItem('c'), 'undefined');
		assert.strictEqual(localStorage.length, 3);
	});

	it('should report the correct value and length when items are removed.', () => {
		localStorage.setItem('a', '1');
		localStorage.setItem('b', '2');
		localStorage.setItem('c', undefined as any);
		localStorage.removeItem('c');
		assert.strictEqual(localStorage.getItem('c'), null);
		assert.strictEqual(localStorage.length, 2);
	});

	it('should report the correct value and length when items are removed.', () => {
		localStorage.setItem('a', '1');
		localStorage.setItem('b', '2');
		localStorage.clear();
		assert.strictEqual(localStorage.getItem('a'), null);
		assert.strictEqual(localStorage.getItem('b'), null);
		assert.strictEqual(localStorage.length, 0);
	});

	it('should handle setting prototype field names properly', () => {
		assert.strictEqual(localStorage.getItem('length'), null);
		localStorage.setItem('length', '12');
		assert.strictEqual(localStorage.length, 1);
		assert.strictEqual(localStorage.getItem('length'), '12');
		localStorage.removeItem('length');
		assert.strictEqual(localStorage.getItem('length'), null);
	});
});
