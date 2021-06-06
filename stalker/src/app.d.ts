/// <reference types="node" />

import { EventEmitter } from "events";
import Randexp from "randexp";
import { CommonMessageEventData, Client } from "oicq";


type QQID = number;
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
  environment: "test" | "production";
  getReaction(name: string): string;
  reactions: {
    [value: string]: Randexp | string [] | string;
  };
}

type AtMetaData = {
  qq: QQID;
  text: string;
}

type CommandNodeType = "at" | "text";

interface ParsedCommandContext {
  command: Array<{ type: CommandNodeType, value: string | number }>;
  commandText: string;
  isAtMe: boolean;
  /* sugar for isAtMe */
  "@me": boolean;
  "@": Array<QQID>;
  reply: (message: string, auto_escape = false) => Promise<void>;
  anonymous: boolean;
  senderID: QQID;
  selfID: QQID;
  groupID: QQID;
  groupName: string;
  sender: {
    user_id: QQID,
    nickname: string,
    card: string,
    sex:  "male" | "female",
    age:  number,
    area: string,
    level: number,
    role: string,
    title: string,
  }
}

interface Context extends ParsedCommandContext, BasicContext {
  data: CommonMessageEventData;
  from: FromType;
  state: {};
  bot: Client;
  pluginCommands: Array<{
    plugin: PluginName;
    command: string;
    filepath: string;
  }>;
  respond: (message: string) => Promise<void>;
  atAndReply: (toAt: Array<AtMetaData> | AtMetaData, message: string) => Promise<void>;
}

export declare class App extends EventEmitter {
  constructor();
  context: BasicContext;

  callback(bot: Client, plugins: PluginInfo[]): MessageHandler;

  listen(options: { 
    credentials: {
      uin?: QQID;
      password_md5: string;
    };
    bot?: Client;
    plugins?: PluginInfo[];
  }): Client;
}
