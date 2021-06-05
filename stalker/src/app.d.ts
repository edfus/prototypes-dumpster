/// <reference types="node" />

import { EventEmitter } from "events";
import Randexp from "randexp";
import { CommonMessageEventData, Client } from "oicq";

/**
 * the prototype from which ctx is created.
 * You may add additional properties to ctx by editing app.context
 */
 interface BasicContext {
  app: App;
  /* parameter `properties` not supported */
  throw(status?: number, message?: string): void;
  /* parameter `properties` not supported */
  assert(shouldBeTruthy: any, status?: number, message?: string): void;
  getReaction(name: string): string;
  reactions: {
    [value: string]: Randexp | string [] | string;
  };
}

type PluginName = string;
type FromType = "private" | "group";

type Next = () => Promise<void>;
type Middleware = (ctx: Context, next: Next) => Promise<void>;
type MessageHandler = (qqData: CommonMessageEventData, type: FromType) => Promise<void>;

interface PluginInfo {
  name: PluginName;
  command?: string;
  filepath: string;
  middleware: Middleware;
}

interface Context extends BasicContext {
  data: CommonMessageEventData;
  from: FromType;
  state: {
    command: string;
    pluginCommands: Array<{
      plugin: PluginName;
      command: string;
      filepath: string;
    }>
  };
  bot: Client;
  respond: () => Promise<void>;
}

export declare class App extends EventEmitter {
  constructor();
  context: BasicContext;

  callback(bot: Client, plugins: PluginInfo[]): MessageHandler;

  listen(options: { 
    credentials: {
      uin?: number;
      password_md5: string;
    };
    bot?: Client;
    plugins?: PluginInfo[];
  }): Client;
}
