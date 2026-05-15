export interface Resource {
  id: string;
  subscription_id: string;
  resource_group: string;
  name: string;
  type: string;
  location: string;
  sku: any;
  tags: Record<string, string>;
  has_public_ip: boolean;
  public_ip_address: string | null;
  has_private_endpoint: boolean;
  has_nsg: boolean;
  properties: any;
  collected_at: string;
}

export interface ChangeEvent {
  id: string;
  correlation_id: string | null;
  resource_id: string | null;
  resource_name: string;
  resource_type: string;
  operation: string;
  changed_by: string | null;
  changed_at: string | null;
  before_state: any;
  after_state: any;
  diff: any;
  risk_level: string;
  risk_reason: string | null;
  notification_sent: boolean;
}

export interface NotificationConfig {
  id: string;
  name: string;
  webhook_type: string;
  webhook_url: string;
  min_risk_level: string;
  enabled: boolean;
}

export interface DashboardStats {
  total_resources: number;
  resources_by_type: Record<string, number>;
  total_changes: number;
  changes_by_risk: Record<string, number>;
  last_synced_at: string | null;
  recent_changes: {
    id: string;
    resource_name: string;
    resource_type: string;
    operation: string;
    risk_level: string;
    changed_at: string | null;
  }[];
}
