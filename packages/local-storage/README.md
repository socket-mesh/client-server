# localStorage

An inefficient, but as W3C-compliant as possible using only pure JavaScript, `localStorage` implementation.

## Purpose

This is meant for the purpose of being able to run unit-tests and such for browser-y modules in node.

## Usage

    var localStorage = require('localStorage')
      , myValue = { foo: 'bar', baz: 'quux' }
      ;

    localStorage.setItem('myKey', JSON.stringify(myValue));
    myValue = localStorage.getItem('myKey');

## API

  * getItem(key)
  * setItem(key, value)
  * removeItem(key)
  * clear()
  * key(n)
  * length

## Tests

    null === localStorage.getItem('key');

    0 === localStorage.length;
    null === localStorage.getItem('doesn't exist');
    undefined === localStorage['doesn't exist'];

    localStorage.setItem('myItem');
    "undefined" === localStorage.getItem('myItem');
    1 === localStorage.length;

    localStorage.setItem('myItem', 0);
    "0" === localStorage.getItem('myItem');

    localStorage.removeItem('myItem', 0);
    0 === localStorage.length;

    localStorage.clear();
    0 === localStorage.length;

TODO / Bugs
---

  * Doesn't not emit `Storage` events
