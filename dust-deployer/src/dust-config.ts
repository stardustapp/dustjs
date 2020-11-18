export interface DustDeployment {
  authority:          DeploymentAuthority;
  backend_deployment: DeploymentBackend;
  apps?:              DeploymentApp[];
}

export interface DeploymentApp {
  id:       string;
  standard: string;
}

export interface DeploymentAuthority {
  firebase: FirebaseAuthority;
}

export interface FirebaseAuthority {
  project_id:   string;
  database_url: string;
  admin_uids?:  string[];
}

export interface DeploymentBackend {
  domain?:         string;
  allowed_origins: string[];
  kubernetes?:     KubernetesConfig;
  env?:            Record<string,string>;
  origin?:         string;
  datadog?:        DatadogConfig;
}

export interface DatadogConfig {
  apiKey:   string;
  appName:  string;
  siteUrl?: string;
}

export interface KubernetesConfig {
  context:             string;
  namespace:           string;
  labels:              Record<string,string>;
  replicas:            number;
  ingressAnnotations?: Record<string,string>;
}



// TODO: descriminated union?
export interface DustProject {
  type:              ProjectType;
  apps?:             ProjectApp[];
  hosted_libraries?: AppLibrary[];
  bundles?:          AppBundle[];
  extraSchemasDir?:  string; // not in use
}

export interface ProjectApp {
  id:        string;
  standard?: string;
  source?:   string;
}

export interface AppBundle {
  source:  string;
  type:    AppBundleType;
  target?: string;
}

export interface AppLibrary {
  npm_module:   string;
  min_version?: string;
  sub_path?:    string;
  paths?:       string[];
  patterns?:    string[];
  source?:      string;
}

export type ProjectType =
| "application"
| "installation"
;

export type AppBundleType =
| "static html"
| "app routines"
| "rollup"
;
