/**
 *  Copyright (c) 2018, AMI System, LLC
 *  All rights reserved.
 *
 *  This source code is licensed under the MIT-style license found in the
 *  LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import WebSocket from 'isomorphic-ws';


declare type CommandArg = string|number|boolean|{};

declare type Command = {
  tag: string,
  agent: string,
  cmd: string,
  args: Array<CommandArg>
};

declare type CommandEntry = {
  command: Command,
  callback: Callback,
  listener: ?Callback,
  expirationTimeMs: number,
  resubscribe: boolean,
};

type StatusType =
  "ok" |
  "error" |
  "message" |
  "pmessage";

declare type Resp = {|
  tag: ?string,
  status: StatusType,
  errorMsg: string,
  command: Command,
  channel?: string,
  pattern?: string,
  result?: mixed,
  message?: string,
|};

declare type Callback = (error: ?Error, data: ?Resp) => void;

export default class XBrokerClient {

  url: string;
  browser: boolean;
  socket: any;
  seq: number;

  sentCommands: {
    [string]: CommandEntry
  };
  subscriptions: {
    [string]: CommandEntry
  };
  psubscriptions: {
    [string]: CommandEntry
  };
  pendingCommands: Array<CommandEntry>;
  sentCommandsCnt: number;
  // init, open, error, closed
  state: string;
  message: string;

  reconnectIntervalMs: number;

  // Props
  maxSentCommandsCnt: number;
  defaultTimeoutMs: number;
  maxReconnectIntervalMs: number;
  watchdogIntervalMs: number;
  batchResults: boolean;

  // changeState(), setMessage()
  props: any;

  reconnectTimer: ?TimeoutID;
  watchdogTimer: ?IntervalID;

  isAlive: boolean;

  constructor(url: string, props: any, browser?: boolean) {
    this.url = url;
    this.browser = false;
    this.seq = 1;
    this.sentCommands = {};
    this.subscriptions = {};
    this.psubscriptions = {};
    this.pendingCommands = [];
    this.sentCommandsCnt = 0;
    this.maxSentCommandsCnt = 8;
    this.defaultTimeoutMs = 30000;
    this.maxReconnectIntervalMs = 15000;
    this.watchdogIntervalMs = 5000;
    this.batchResults = false;
    this.changeState("init");
    this.props = props;
    this.reconnectTimer = null;
    this.watchdogTimer = null;
    this.isAlive = false;

    if(browser) {
      this.browser = true;
    }
    if(this.props) {
      if(this.props.defaultTimeoutMs !== undefined && this.props.defaultTimeoutMs !== null) {
        this.defaultTimeoutMs = this.props.defaultTimeoutMs;
      }
      if(this.props.maxSentCommandsCnt !== undefined && this.props.maxSentCommandsCnt !== null) {
        this.maxSentCommandsCnt = this.props.maxSentCommandsCnt;
      }
      if(this.props.maxReconnectIntervalMs !== undefined && this.props.maxReconnectIntervalMs !== null) {
        this.maxReconnectIntervalMs = this.props.maxReconnectIntervalMs;
      }
      if(this.props.watchdogIntervalMs !== undefined && this.props.watchdogIntervalMs !== null) {
        this.watchdogIntervalMs = this.props.watchdogIntervalMs;
      }
      if(this.props.batchResults !== undefined && this.props.batchResults !== null) {
        this.batchResults = this.props.batchResults;
      }
    }

    this.reconnectIntervalMs = this.maxReconnectIntervalMs;

    try {
      if(this.browser) {
        this.socket = new WebSocket(this.url);
      } else {
        const options = {rejectUnauthorized: false};
        this.socket = new WebSocket(this.url, options);
      }
      this.initSocket(this.socket);
      this.startWatchdog();
    } catch(e) {
      throw e;
    }
  }

  changeState(state: string): void {
    this.state = state;

    if(this.props && this.props.changeState) {
      this.props.changeState(state);
    }
  }

  setMessage(message: string): void {
    this.message = message;

    if(this.props && this.props.setMessage) {
      this.props.setMessage(message);
    }
  }

  resubscribe(): void {
    for(const channel: string in this.subscriptions) {
      const ce: CommandEntry = this.subscriptions[channel];
      const callback: Callback = (error: ?Error, data: ?Resp) => {};
      this.resubscribeCommand(ce.command.agent, ce.command.cmd, ce.command.args, callback, ce.listener);
    }
    for(const pattern: string in this.psubscriptions) {
      const ce: CommandEntry = this.psubscriptions[pattern];
      const callback: Callback = (error: ?Error, data: ?Resp) => {};
      this.resubscribeCommand(ce.command.agent, ce.command.cmd, ce.command.args, callback, ce.listener);
    }
  }

  initSocket(socket: any): void {

    socket.addEventListener('open', (event) => {
      this.onOpen();
    });

    socket.addEventListener('error', (event) => {
      this.onError();
    });

    socket.addEventListener('message', (event) => {
      const data = event.data;
      this.onMessage(data);
    });

    socket.addEventListener('close', (event) => {
      this.onClose(event);
    });
  }

  onOpen() {
    this.changeState("open");
    this.setMessage("");

    this.reconnectIntervalMs = 1000;
    if(this.reconnectIntervalMs > this.maxReconnectIntervalMs) {
      this.reconnectIntervalMs = this.maxReconnectIntervalMs
    }

    this.send();

    this.resubscribe();
  }

  onError() {
    this.changeState("error");
    this.setMessage("");
  }

  _processResult(result: Resp, data: string) {
    if(result.status === "message")
    {
      // find a subscription
      if(!result.channel) {
        this.setMessage("WARNING: no channel in message: "+data);
        return;
      }
      const commandEntry: CommandEntry = this.subscriptions[result.channel];
      if(!commandEntry) {
        this.setMessage("WARNING: no subscription for a message: "+data);
        return;
      }
      if(commandEntry.listener) {
        commandEntry.listener(undefined, result);
      }
      return;
    }

    if(result.status === "pmessage")
    {
      // find a psubscription
      if(!result.pattern) {
        this.setMessage("WARNING: no pattern in pmessage: "+data);
        return;
      }
      const commandEntry: CommandEntry = this.psubscriptions[result.pattern];
      if(!commandEntry) {
        this.setMessage("WARNING: no pattern subscription for a message: "+data);
        return;
      }
      if(commandEntry.listener) {
        commandEntry.listener(undefined, result);
      }
      return;
    }

    if(!result.tag) {
      this.setMessage("WARNING: missing tag in a message: "+data);
      return;
    }

    const commandEntry = this.sentCommands[result.tag];
    if(!commandEntry) {
      this.setMessage("WARNING: cannot find a command with a tag: "+result.tag);
      return;
    }

    delete this.sentCommands[result.tag];
    this.sentCommandsCnt--;
    this.send();

    const command: Command = commandEntry.command;
    const cmd: string = command.cmd.toLowerCase();

    switch(cmd) {
    case 'unsubscribe': {
      for(let i = 0; i < command.args.length; i++) {
        const channel: string = command.args[i].toString();
        if(this.subscriptions[channel]) {
          delete this.subscriptions[channel];
        }
      }
      break;
    }
    case 'punsubscribe': {
      for(let i = 0; i < command.args.length; i++) {
        const pattern: string = command.args[i].toString();
        if(this.psubscriptions[pattern]) {
          delete this.psubscriptions[pattern];
        }
      }
      break;
    }
    }
    commandEntry.callback(undefined, result);
  }

  onMessage(data: string) {
    if(!data) {
      this.setMessage("WARNING: received an empty message");
      return;
    }
    if(data === "PONG") {
      this.isAlive = true;
      return;
    }
    let results: ?Array<string>;
    try {
      results = JSON.parse(data);
    }
    catch(e) {
      this.setMessage("WARNING: received a corrupt message: "+e.name+", "+e.message);
      return;
    }
    if(!results) {
      this.setMessage("WARNING: received a falsey message: "+data);
      return;
    }

    for(let i = 0; i < results.length; i++) {
      const result: Resp = JSON.parse(results[i]);
      this._processResult(result, results[i]);
    }
  }

  onClose(event: any) {
    this.changeState("closed");
    this.setMessage("Disconnected from websocket: code="+event.code+", reason="+event.reason);
    this.failSentCommands("Websocket closed");
    this.reconnect();
  }

  failSentCommands(message: string) {
    for(let tag in this.sentCommands) {
      const commandEntry:CommandEntry = this.sentCommands[tag];
      this.fail(commandEntry, message);
    }
    this.sentCommands = {};
  }

  fail(commandEntry: CommandEntry, message: string): void {
    const command: Command = commandEntry.command;
    const resp: Resp = {
      tag: command.tag,
      status: 'error',
      errorMsg: message,
      command: command
    };
    commandEntry.callback(null, resp);
  }

  send(): void {
    while(this.pendingCommands.length > 0
      && this.sentCommandsCnt < this.maxSentCommandsCnt
      && this.socket.readyState === WebSocket.OPEN) {
      const commandEntry: CommandEntry = this.pendingCommands.shift();
      const command = commandEntry.command;

      if(this.sentCommands[command.tag]) {
        this.fail(commandEntry, "Duplicate tag: "+command.tag);
      } else {
        const cmd: string = command.cmd.toLowerCase();

        switch(cmd) {
        case 'subscribe': {
          if(!commandEntry.resubscribe)
          for(let i = 0; i < command.args.length; i++) {
            const channel: string = command.args[i].toString();
            if(this.subscriptions[channel]) {
              // Channel already subscribed to
              this.fail(commandEntry, "Channel already subscribed: "+channel);
            }
          }
          for(let i = 0; i < command.args.length; i++) {
            const channel: string = command.args[i].toString();
            this.subscriptions[channel] = commandEntry;
          }
          break;
        }
        case 'psubscribe': {
          if(!commandEntry.resubscribe)
          for(let i = 0; i < command.args.length; i++) {
            const pattern: string = command.args[i].toString();
            if(this.psubscriptions[pattern]) {
              // Channel already subscribed to
              this.fail(commandEntry, "Pattern already subscribed: "+pattern);
            }
          }
          for(let i = 0; i < command.args.length; i++) {
            const pattern: string = command.args[i].toString();
            this.psubscriptions[pattern] = commandEntry;
          }
          break;
        }
        }

        try {
          this.socket.send(JSON.stringify(command));
          this.sentCommands[command.tag] = commandEntry;
          this.sentCommandsCnt++;
        } catch(e) {
          this.fail(commandEntry, "Send failed: "+e.message);
        }
      }
    }
  }

  resubscribeCommand(agent: string, cmd: string, args: Array<CommandArg>, callback: Callback, listener: ?Callback): string {
    const command = {tag: this.seq.toString(), agent: agent, cmd: cmd, args: args};
    this.seq++;
    const commandEntry: CommandEntry = {
      command,
      callback,
      listener,
      expirationTimeMs: Date.now()+this.defaultTimeoutMs,
      resubscribe: true,
    };
    this.pendingCommands.push(commandEntry);

    this.send();

    return command.tag;
  }

  submit(command: Command, callback: Callback, listener: ?Callback): string {
    command.tag = this.seq.toString();
    this.seq++;

    const commandEntry: CommandEntry = {
      command,
      callback,
      listener,
      expirationTimeMs: Date.now()+this.defaultTimeoutMs,
      resubscribe: false,
    };
    this.pendingCommands.push(commandEntry);

    this.send();

    return command.tag;
  }

  command(agent: string, cmd: string, args: Array<CommandArg>, callback: Callback, listener: ?Callback): string {
    const command = {tag: "", agent: agent, cmd: cmd, args: args};
    return this.submit(command, callback, listener);
  }

  commandAsync(agent: string, cmd: string, args: Array<CommandArg>, listener: ?Callback): Promise<mixed> {
    const self = this;
    return new Promise(function(resolve, reject) {
      const callback: Callback = (error, result: mixed) => {
        if(error) {
          reject(error);
        } else {
          resolve(result);
        }
      };
      self.command(agent, cmd, args, callback, listener);
    });
  }

  close(): void {
    try {
      this.socket.close();
    } finally {
      if(this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if(this.watchdogTimer) {
        clearInterval(this.watchdogTimer);
        this.watchdogTimer = null;
      }
    }
  }

  reconnect(): void {
    if(this.socket.readyState === WebSocket.OPEN) {
      // already connected
      return;
    }

    if(this.reconnectTimer === null) {
      this.setMessage("Reconnecting in "+this.reconnectIntervalMs+"ms");
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if(this.socket.readyState === WebSocket.OPEN) {
          // already connected
          return;
        }
        this.setMessage("Reconnecting now");
        try {
          this.socket = new WebSocket(this.url);
          this.initSocket(this.socket);
        } catch(e) {
          this.setMessage("RECONNECT ERROR: "+e.toString());
        }
      }, this.reconnectIntervalMs);

      this.reconnectIntervalMs += 1000;
      if(this.reconnectIntervalMs > this.maxReconnectIntervalMs) {
        this.reconnectIntervalMs = this.maxReconnectIntervalMs
      }
    }
  }

  watchdog(): void {
    if(this.isAlive) {
      this.isAlive = false;
      try {
        this.socket.send("PING");
      } catch(e) {
      }
    } else {
      try {
        this.socket.close();
      } finally {
        this.reconnect();
      }
    }

    const now = Date.now();
    while(this.pendingCommands.length > 0) {
        const commandEntry: CommandEntry = this.pendingCommands[0];

        if(commandEntry.expirationTimeMs >= now) {
          break;
        }

        this.pendingCommands.shift();
        this.fail(commandEntry, "command timeout");
    }
  }

  startWatchdog(): void {
    this.isAlive = true;
    this.watchdogTimer = setInterval(() => {
      this.watchdog();
    }, this.watchdogIntervalMs)
  }

}

