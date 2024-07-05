import assert from 'node:assert';
import { describe, it } from "node:test";
import codec from "../src/index.js";

describe('formatter', function () {
  let ab2str = function (buf: ArrayBuffer): string {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
  };

  let str2ab = function (str: string): ArrayBuffer {
    let buf = new ArrayBuffer(str.length);
    let bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  };

  describe('encode', () => {
    it('should encode an Object into a string', () => {
      let rawObject: { foo: number, arr: number[], complexArr: any[], ob: any } = 
			 {
        foo: 123,
        arr: [1, 2, 3, 4],
        complexArr: [
          {a: 1, b: 2},
          {c: 3, d: 4, e: 5},
          {foo: 'bar'},
          ['a', 'b', 'c', {nested: 'object'}]
        ],
        ob: {hi: 'hello'}
      };
      rawObject.complexArr.push(rawObject.arr);

      let encoded = codec.encode(rawObject);
      let expected = JSON.stringify(rawObject);

      assert(encoded == expected, 'Encoded data did not match expected output');
    });

    it('should serialize binary Buffer objects to base64 strings', () => {
      let rawObject = {
        foo: 123,
        buff: Buffer.from('hello', 'utf8'),
        buffArr: [Buffer.from('world', 'utf8')]
      };
      let encoded = codec.encode(rawObject);
      let expected = JSON.stringify({
        foo: 123,
        buff: {base64: true, data: 'aGVsbG8='},
        buffArr: [
          {base64: true, data: 'd29ybGQ='}
        ]
      });

      assert(encoded == expected, 'Encoded data did not match expected output');
    });

    it('should serialize binary ArrayBuffer objects to base64 strings', () => {
      let rawObject = {
        foo: 123,
        buff: str2ab('hello'),
        buffArr: [str2ab('world')]
      };
      let encoded = codec.encode(rawObject);
      let expected = JSON.stringify({
        foo: 123,
        buff: {base64: true, data: 'aGVsbG8='},
        buffArr: [
          {base64: true, data: 'd29ybGQ='}
        ]
      });

      assert(encoded == expected, 'Encoded data did not match expected output');
    });

    it('should throw error if there is a circular structure - Basic', () => {
      let rawObject: { foo: number, arr: any[] } = {
        foo: 123,
        arr: []
      };
      rawObject.arr.push(rawObject);

      let error: Error | null = null;
      try {
        codec.encode(rawObject);
      } catch (err) {
        error = err;
      }

      assert(error != null, 'Expected an error to be thrown');
    });

    it('should throw error if there is a circular structure - Single level nesting', () => {
			let rawObject = {
        foo: {
          hello: 'world',
          bar: {
            deep: {}
          }
        }
      };
      rawObject.foo.bar.deep = rawObject.foo;

      let error: Error | null = null;
			
      try {
        codec.encode(rawObject);
      } catch (err) {
        error = err;
      }
      assert(error != null, 'Expected an error to be thrown');
    });

    it('should ignore prototype properties', () => {
      (Object.prototype as any).prototypeProperty = 123;
      let rawObject = {
        foo: 123
      };
      let encoded = codec.encode(rawObject);
      let expected = '{"foo":123}';
      assert(encoded == expected, 'Encoded data did not match expected output');
      delete Object.prototype['prototypeProperty' as keyof Object];
    });

    it('should ignore properties which contain functions', () => {
      let rawObject = {
        foo: 123,
        fun: function () {
          return 456;
        }
      };
      let encoded = codec.encode(rawObject);
      let expected = JSON.stringify({foo: 123});
      assert(encoded == expected, 'Encoded data did not match expected output');
    });


		it('should leave ping & pong messages alone', () => {
			assert.strictEqual(codec.encode('#1'), '#1');
			assert.strictEqual(codec.encode('#2'), '#2');
		});
  });
});
