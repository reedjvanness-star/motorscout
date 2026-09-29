import type {Workspace,Source} from './domain';
import type {connectionStatus} from './connections';
import type {SavedAlert,MatchNotification} from '../components/search-alerts';
export type ConnectionStatus=Awaited<ReturnType<typeof connectionStatus>>;
export type WorkspaceSnapshot={workspace:Workspace;notifications:MatchNotification[];emailReady:boolean;ai:boolean;sources:Source[];alerts:SavedAlert[];schedulerReady:boolean;connections:ConnectionStatus;error?:string};
export type WorkspaceAction={action:string;[field:string]:unknown};
export type ModelContextDocument=Document & {modelContext?:{registerTool(tool:{name:string;description:string;inputSchema:object;annotations:object;execute:()=>unknown},options:{signal:AbortSignal}):unknown}};
