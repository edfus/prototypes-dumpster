/// <reference types="node" />

import { EventEmitter } from "events";
import Randexp from "randexp";
import { CommonMessageEventData, Client, MediaFile } from "oicq";

import { Container } from "@nlpjs/core";
import { NluManager } from "@nlpjs/nlu";

type QQID = number;
type PluginName = string;
type FromType = "private" | "group" | "discuss";

type Next = () => Promise<void>;
type Middleware = (ctx: Context, next: Next) => Promise<void>;
type MessageHandler = (qqData: CommonMessageEventData) => Promise<void>;

type PluginMetadata = {
  name: PluginName;
  command:  string;
  /* Default: 5 */
  priority: number;
  filepath:  string;
};

interface Plugin {
  meta: PluginMetadata;
  middleware: Middleware;
};

/**
 * the prototype from which ctx is created.
 * You may add additional properties to ctx by editing app.context
 */
interface BasicContext {
  app: App;
  nlp: {
    container: null | Container;
    loaded: boolean;
    loadPromise: null | Promise<void>;
  };
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
  /* is a private message from a friend */
  isFriend: boolean;
  // reply: (message: string, auto_escape?: boolean) => Promise<void>;
  anonymous: boolean;
  senderID: QQID;
  selfID: QQID;
  groupID: QQID;
  groupName: string;
  sender: {
    user_id: QQID,
    nickname: string,
    card: string,
    sex:  "male" | "female" | "unknown",
    age:  number,
    area: string,
    level: number,
    role: "owner" | "admin" | "member",
    title: string,
  }
}

interface NLU {
  nlu: {
    manager: null | NluManager;
    trained: boolean;
    domains: Array<string>;
  }
}

interface Context extends ParsedCommandContext, BasicContext, NLU {
  data: CommonMessageEventData;
  from: FromType;
  state: {};
  bot: Client;
  plugins: Array<PluginMetadata>;
  respond: (message: string, auto_escape?: boolean) => Promise<void>;
  atAndRespond: (toAt: Array<AtMetaData> | AtMetaData, message: string) => Promise<void>;
  sendImage: (image: MediaFile) => Promise<void>;
}

declare class App extends EventEmitter {
  constructor();
  context: BasicContext;

  prepend (builtInPlugin: Plugin): this;

  callback(bot: Client, plugins: Plugin[]): MessageHandler;

  listen(options: { 
    credentials: {
      uin?: QQID;
      password_md5: string;
    };
    bot?: Client;
    plugins?: Plugin[];
  }): Promise<Client>;
}

export default App;