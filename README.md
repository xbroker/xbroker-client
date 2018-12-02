![X-Broker](http://xbroker.github.io/xbroker/xbroker.svg)
=====
[![npm version](https://badge.fury.io/js/xbroker-client.svg)](https://badge.fury.io/js/xbroker-client)
[![jest](https://img.shields.io/badge/tested_with-jest-brightgreen.svg)](https://facebook.github.io/jest/)
[![dependencies](https://img.shields.io/david/xbroker/xbroker-client.svg)](https://david-dm.org/xbroker/xbroker-client)
[![devDependencies](https://img.shields.io/david/dev/xbroker/xbroker-client.svg)](https://david-dm.org/xbroker/xbroker-client?type=dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)

XBroker Javascript Client

Installation
------------

```shell
npm install xbroker-client
```

Usage
-----

```shell
$ npx xbroker-client -h
usage: xbroker-client [options]

options:
```

Example
-------

Start a websocket server:

```shell
$ npx xbroker
Starting up xbroker, serving port 3500
Hit CTRL-C to stop the server
```

Start a websocket server when redis requires authentication:

```shell
$ npx xbroker -a password
Starting up xbroker, serving port 3500
Hit CTRL-C to stop the server
```

Open a console in a browser and create a client socket:

```js
var socket = new WebSocket("ws://localhost:3500");

socket.onopen = function(event) {
    console.log("Connected to: " + event.currentTarget.url);
};

socket.onerror = function(error) {
    console.log("Websocket error: " + error);
};

socket.onmessage = function(event) {
    console.log(JSON.stringify(JSON.parse(event.data), undefined, 4));
};

socket.onclose = function(error) {
    console.log("Disconnected from websocket");
};
```

Send the command "KEYS *" in a JSON format to Redis:

```js
socket.send('{"tag": "1", "cmd": "keys", "args": ["*"]}')

{
    "tag": "1",
    "status": "ok",
    "result": [
        "key1",
        "key2",
        "key3"
    ],
    "command": {"tag": "1", "cmd": "keys", "args": ["*TXN*"]}
}
```
Development
-----------

Setup:

```shell
git clone https://github.com/xbroker/xbroker-client.git
cd xbroker-client
npm install
```

Build:
```shell
npm run build
```

Test:
```shell
npm test
```

Lint, Build, Test, and Clean:
```shell
npm run all
```

Update Dependencies:
```shell
npm update --save
```

License
-------

MIT
