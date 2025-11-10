import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import LocalStorage from '../src/index.js';

describe('LocalStorage', () => {
	beforeEach(async () => {
		LocalStorage.clear();
	});

	it('should not return prototypical things', () => {
		assert.strictEqual(LocalStorage.getItem('key'), null);
	});

	it('should not make assuptions about key positioning', () => {
		LocalStorage.setItem('a', '1');
		assert.strictEqual(LocalStorage.key(0), 'a');
	});

	it('should report the correct length', () => {
		LocalStorage.setItem('a', '1');
		LocalStorage.setItem('b', '2');
		assert.strictEqual(LocalStorage.getItem('a'), '1');
		assert.strictEqual(LocalStorage.getItem('b'), '2');
		assert.strictEqual(LocalStorage.length, 2);
	});

	it('should return the correct values for undefined items.', () => {
		assert.strictEqual(LocalStorage['c'], undefined);
		assert.strictEqual(LocalStorage.getItem('c'), null);
	});

	it('should return "undefined" for values that are set to undefined.', () => {
		LocalStorage.setItem('a', '1');
		LocalStorage.setItem('b', '2');
		LocalStorage.setItem('c', undefined as any);
		assert.strictEqual(LocalStorage.getItem('c'), 'undefined');
		assert.strictEqual(LocalStorage.length, 3);
	});

	it('should report the correct value and length when items are removed.', () => {
		LocalStorage.setItem('a', '1');
		LocalStorage.setItem('b', '2');
		LocalStorage.setItem('c', undefined as any);
		LocalStorage.removeItem('c');
		assert.strictEqual(LocalStorage.getItem('c'), null);
		assert.strictEqual(LocalStorage.length, 2);
	});

	it('should report the correct value and length when items are removed.', () => {
		LocalStorage.setItem('a', '1');
		LocalStorage.setItem('b', '2');
		LocalStorage.clear();
		assert.strictEqual(LocalStorage.getItem('a'), null);
		assert.strictEqual(LocalStorage.getItem('b'), null);
		assert.strictEqual(LocalStorage.length, 0);
	});

	it('should handle setting prototype field names properly', () => {
		assert.strictEqual(LocalStorage.getItem('length'), null);
		LocalStorage.setItem('length', '12');
		assert.strictEqual(LocalStorage.length, 1);
		assert.strictEqual(LocalStorage.getItem('length'), '12');
		LocalStorage.removeItem('length');
		assert.strictEqual(LocalStorage.getItem('length'), null);
	});
});
