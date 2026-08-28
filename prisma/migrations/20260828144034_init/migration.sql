-- CreateEnum
CREATE TYPE "CustomerAccessKind" AS ENUM ('gold_read', 'sql_read', 'report_view', 'semantic_model_build', 'portal_access');

-- CreateEnum
CREATE TYPE "CustomerAccessPrincipalType" AS ENUM ('existing_entra_user', 'guest_invite', 'internal_user', 'security_group', 'service_principal');

-- CreateEnum
CREATE TYPE "CustomerAccessStatus" AS ENUM ('pending', 'granted', 'revoked', 'failed');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('success', 'failure');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('platform_admin', 'service_agent', 'operations', 'customer_admin', 'customer_user');

-- CreateEnum
CREATE TYPE "ArchitecturePattern" AS ENUM ('simple', 'medallion', 'enterprise', 'custom');

-- CreateEnum
CREATE TYPE "InfrastructureConfigurationStatus" AS ENUM ('draft', 'finalized');

-- CreateEnum
CREATE TYPE "DesiredResourceStatus" AS ENUM ('pending', 'validating', 'ready', 'running', 'succeeded', 'failed', 'skipped', 'rollback_pending', 'rolled_back');

-- CreateEnum
CREATE TYPE "ActualResourceProvisioningStatus" AS ENUM ('provisioning', 'active', 'degraded', 'failed', 'deleted');

-- CreateEnum
CREATE TYPE "ConnectorCategory" AS ENUM ('microsoft', 'databases', 'cloud_storage', 'saas', 'files', 'web', 'analytics', 'erp', 'crm', 'other');

-- CreateEnum
CREATE TYPE "ConnectionAuthMethod" AS ENUM ('OAuth2', 'UsernamePassword', 'ServicePrincipal', 'APIKey', 'AccountKey', 'SAS', 'Anonymous', 'OrganizationalAccount', 'Gateway', 'Key', 'Windows', 'WindowsWithoutImpersonation', 'SharedAccessSignature', 'WorkspaceIdentity', 'KeyPair');

-- CreateEnum
CREATE TYPE "ConnectionHealth" AS ENUM ('unknown', 'healthy', 'degraded', 'failed');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('draft', 'authenticating', 'connected', 'error', 'disabled');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('draft', 'configuration', 'ready_for_deployment', 'deploying', 'active', 'error', 'suspended');

-- CreateEnum
CREATE TYPE "ServiceTier" AS ENUM ('starter', 'standard', 'enterprise');

-- CreateEnum
CREATE TYPE "CustomerEnvironmentMode" AS ENUM ('single', 'dev_test_prod');

-- CreateEnum
CREATE TYPE "CustomerUserRole" AS ENUM ('customer_admin', 'customer_user');

-- CreateEnum
CREATE TYPE "CustomerUserStatus" AS ENUM ('invited', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "FabricCapabilityCategory" AS ENUM ('storage', 'compute', 'pipeline', 'analytics', 'realtime', 'data_science', 'reporting', 'governance', 'other');

-- CreateEnum
CREATE TYPE "ParameterInputType" AS ENUM ('text', 'textarea', 'number', 'boolean', 'select', 'multiSelect', 'json', 'password', 'resourcePicker', 'workspacePicker', 'folderPicker', 'connectionPicker', 'userPicker', 'date', 'datetime');

-- CreateEnum
CREATE TYPE "ParameterMode" AS ENUM ('basic', 'advanced', 'raw');

-- CreateEnum
CREATE TYPE "LoadMethod" AS ENUM ('full', 'incremental', 'cdc');

-- CreateEnum
CREATE TYPE "IngestionScheduleFrequency" AS ENUM ('manual', 'hourly', 'every_6_hours', 'daily', 'weekly');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'portal');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('welcome_email', 'appointment_confirmation', 'deployment_failed', 'service_status_change', 'general');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('open', 'acknowledged', 'resolved');

-- CreateEnum
CREATE TYPE "AlertSourceEvent" AS ENUM ('pipeline_failure', 'initial_load_failure', 'connection_failure', 'oauth_expired', 'data_freshness_sla_breach', 'repeated_job_failures', 'sql_endpoint_unavailable', 'unexpected_growth');

-- CreateEnum
CREATE TYPE "RollbackPolicy" AS ENUM ('KEEP_SUCCESSFUL_RESOURCES', 'ROLLBACK_CREATED_RESOURCES');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('draft', 'pending', 'running', 'partially_failed', 'failed', 'succeeded', 'cancelled', 'rolled_back');

-- CreateEnum
CREATE TYPE "DeploymentStepStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'skipped', 'retrying');

-- CreateEnum
CREATE TYPE "LroStatus" AS ENUM ('NotStarted', 'Running', 'Succeeded', 'Failed', 'Cancelled');

-- CreateEnum
CREATE TYPE "ServiceSkill" AS ENUM ('fabric', 'power_bi', 'data_engineering', 'data_science', 'realtime');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');

-- CreateTable
CREATE TABLE "CustomerAccess" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "CustomerAccessKind" NOT NULL,
    "principalType" "CustomerAccessPrincipalType" NOT NULL,
    "principalId" TEXT NOT NULL,
    "groupName" TEXT,
    "fabricWorkspaceId" TEXT,
    "fabricItemId" TEXT,
    "fabricRole" TEXT,
    "status" "CustomerAccessStatus" NOT NULL DEFAULT 'pending',
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "deploymentId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "status" "AuditStatus" NOT NULL DEFAULT 'success',
    "correlationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "entraObjectId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "role" "PlatformRole" NOT NULL DEFAULT 'customer_user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Blueprint" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pattern" "ArchitecturePattern" NOT NULL DEFAULT 'custom',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "clonedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Blueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintResource" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "logicalName" TEXT NOT NULL,
    "displayNameTemplate" TEXT NOT NULL,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "dependsOn" TEXT[],
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "layer" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BlueprintResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfrastructureConfiguration" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "blueprintId" TEXT,
    "name" TEXT NOT NULL,
    "environmentMode" "CustomerEnvironmentMode" NOT NULL DEFAULT 'single',
    "architecture" "ArchitecturePattern" NOT NULL DEFAULT 'medallion',
    "namingConventionTemplate" TEXT NOT NULL DEFAULT '{customer}_{environment}_{layer}_{type}',
    "sqlSelfServiceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sqlSelfServiceTargetLayer" TEXT NOT NULL DEFAULT 'gold',
    "sqlIncludeInWelcomeEmail" BOOLEAN NOT NULL DEFAULT true,
    "semanticModelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "starterReportEnabled" BOOLEAN NOT NULL DEFAULT false,
    "usageReportEnabled" BOOLEAN NOT NULL DEFAULT false,
    "usageReportOptionsJson" JSONB NOT NULL DEFAULT '{}',
    "operationalAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "InfrastructureConfigurationStatus" NOT NULL DEFAULT 'draft',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "InfrastructureConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationVersion" (
    "id" TEXT NOT NULL,
    "infrastructureConfigurationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "changeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ConfigurationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesiredResource" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "logicalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "dependsOn" TEXT[],
    "status" "DesiredResourceStatus" NOT NULL DEFAULT 'pending',
    "actualResourceId" TEXT,
    "layer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesiredResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActualResource" (
    "id" TEXT NOT NULL,
    "desiredResourceId" TEXT NOT NULL,
    "fabricWorkspaceId" TEXT NOT NULL,
    "fabricItemId" TEXT NOT NULL,
    "fabricItemType" TEXT NOT NULL,
    "provisioningStatus" "ActualResourceProvisioningStatus" NOT NULL DEFAULT 'provisioning',
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActualResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorMetadata" (
    "id" TEXT NOT NULL,
    "connectionTypeKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" "ConnectorCategory" NOT NULL DEFAULT 'other',
    "creationMethodsJson" JSONB NOT NULL DEFAULT '[]',
    "supportedCredentialTypesJson" JSONB NOT NULL DEFAULT '[]',
    "gatewayRequired" BOOLEAN NOT NULL DEFAULT false,
    "iconKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "infrastructureConfigurationId" TEXT,
    "connectorTypeKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "authMethod" "ConnectionAuthMethod" NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'draft',
    "parametersJson" JSONB NOT NULL DEFAULT '{}',
    "fabricConnectionId" TEXT,
    "connectedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastValidationAt" TIMESTAMP(3),
    "health" "ConnectionHealth" NOT NULL DEFAULT 'unknown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionSecretReference" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "secretReference" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectionSecretReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactFirstName" TEXT NOT NULL,
    "contactLastName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "tenantId" TEXT,
    "domain" TEXT,
    "environmentMode" "CustomerEnvironmentMode" NOT NULL DEFAULT 'single',
    "serviceTier" "ServiceTier" NOT NULL DEFAULT 'standard',
    "status" "CustomerStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerUser" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CustomerUserRole" NOT NULL DEFAULT 'customer_user',
    "status" "CustomerUserStatus" NOT NULL DEFAULT 'invited',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SqlEndpoint" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fabricWorkspaceId" TEXT NOT NULL,
    "fabricLakehouseId" TEXT NOT NULL,
    "server" TEXT NOT NULL,
    "database" TEXT NOT NULL,
    "connectionString" TEXT NOT NULL,
    "provisioningStatus" TEXT NOT NULL DEFAULT 'InProgress',
    "readOnly" BOOLEAN NOT NULL DEFAULT true,
    "exposedInPortal" BOOLEAN NOT NULL DEFAULT false,
    "includedInWelcomeEmail" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SqlEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringConfiguration" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "showServiceStatus" BOOLEAN NOT NULL DEFAULT true,
    "showDataFreshness" BOOLEAN NOT NULL DEFAULT true,
    "showRefreshSuccess" BOOLEAN NOT NULL DEFAULT true,
    "showUsageTrend" BOOLEAN NOT NULL DEFAULT false,
    "showAdvancedTechnical" BOOLEAN NOT NULL DEFAULT false,
    "operationalAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetCatalogEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessDescription" TEXT,
    "layer" TEXT NOT NULL DEFAULT 'gold',
    "lastUpdatedAt" TIMESTAMP(3),
    "refreshFrequency" TEXT,
    "availableViaSql" BOOLEAN NOT NULL DEFAULT false,
    "availableViaReport" BOOLEAN NOT NULL DEFAULT false,
    "desiredResourceLogicalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatasetCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FabricCapability" (
    "id" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" "FabricCapabilityCategory" NOT NULL DEFAULT 'other',
    "description" TEXT,
    "apiPath" TEXT NOT NULL,
    "createSupported" BOOLEAN NOT NULL DEFAULT false,
    "updateSupported" BOOLEAN NOT NULL DEFAULT false,
    "deleteSupported" BOOLEAN NOT NULL DEFAULT false,
    "definitionSupported" BOOLEAN NOT NULL DEFAULT false,
    "creationPayloadSupported" BOOLEAN NOT NULL DEFAULT false,
    "folderSupported" BOOLEAN NOT NULL DEFAULT true,
    "servicePrincipalSupported" BOOLEAN NOT NULL DEFAULT true,
    "requiredScopes" TEXT[],
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "documentationUrl" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FabricCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FabricParameterSchema" (
    "id" TEXT NOT NULL,
    "fabricCapabilityId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "inputType" "ParameterInputType" NOT NULL,
    "mode" "ParameterMode" NOT NULL DEFAULT 'basic',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" JSONB,
    "optionsJson" JSONB,
    "validationJson" JSONB,
    "targetPath" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FabricParameterSchema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionConfiguration" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "infrastructureConfigurationId" TEXT NOT NULL,
    "sourceObject" TEXT NOT NULL,
    "loadMethod" "LoadMethod" NOT NULL DEFAULT 'full',
    "watermarkColumn" TEXT,
    "destinationLogicalName" TEXT NOT NULL,
    "destinationTable" TEXT,
    "scheduleFrequency" "IngestionScheduleFrequency" NOT NULL DEFAULT 'daily',
    "scheduleCron" TEXT,
    "fabricPipelineItemId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "userId" TEXT,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'email',
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "subject" TEXT,
    "bodyPreview" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "sourceEvent" "AlertSourceEvent" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'warning',
    "status" "AlertStatus" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "context" JSONB,
    "customerVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "infrastructureConfigurationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'draft',
    "rollbackPolicy" "RollbackPolicy" NOT NULL DEFAULT 'KEEP_SUCCESSFUL_RESOURCES',
    "planJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentStep" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "desiredResourceId" TEXT,
    "stepKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "DeploymentStepStatus" NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "requestMetadata" JSONB,
    "responseMetadata" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "resourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LongRunningOperation" (
    "id" TEXT NOT NULL,
    "deploymentStepId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "status" "LroStatus" NOT NULL DEFAULT 'NotStarted',
    "retryAfterSeconds" INTEGER,
    "resourceId" TEXT,
    "requestId" TEXT,
    "percentComplete" INTEGER,
    "resultJson" JSONB,
    "errorJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "polledAt" TIMESTAMP(3),

    CONSTRAINT "LongRunningOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAgent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "calendarUserId" TEXT,
    "skills" "ServiceSkill"[],
    "language" TEXT NOT NULL DEFAULT 'en',
    "workingHoursJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceAgentId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'pending',
    "calendarEventId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerAccess_customerId_idx" ON "CustomerAccess"("customerId");

-- CreateIndex
CREATE INDEX "CustomerAccess_status_idx" ON "CustomerAccess"("status");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_customerId_idx" ON "AuditLog"("customerId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_entraObjectId_key" ON "User"("entraObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Blueprint_key_key" ON "Blueprint"("key");

-- CreateIndex
CREATE INDEX "Blueprint_pattern_idx" ON "Blueprint"("pattern");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintResource_blueprintId_logicalName_key" ON "BlueprintResource"("blueprintId", "logicalName");

-- CreateIndex
CREATE INDEX "InfrastructureConfiguration_customerId_idx" ON "InfrastructureConfiguration"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationVersion_infrastructureConfigurationId_version_key" ON "ConfigurationVersion"("infrastructureConfigurationId", "version");

-- CreateIndex
CREATE INDEX "DesiredResource_deploymentId_status_idx" ON "DesiredResource"("deploymentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DesiredResource_deploymentId_logicalName_key" ON "DesiredResource"("deploymentId", "logicalName");

-- CreateIndex
CREATE UNIQUE INDEX "ActualResource_desiredResourceId_key" ON "ActualResource"("desiredResourceId");

-- CreateIndex
CREATE INDEX "ActualResource_fabricWorkspaceId_idx" ON "ActualResource"("fabricWorkspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ActualResource_fabricWorkspaceId_fabricItemId_key" ON "ActualResource"("fabricWorkspaceId", "fabricItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorMetadata_connectionTypeKey_key" ON "ConnectorMetadata"("connectionTypeKey");

-- CreateIndex
CREATE INDEX "ConnectorMetadata_category_idx" ON "ConnectorMetadata"("category");

-- CreateIndex
CREATE INDEX "Connection_customerId_idx" ON "Connection"("customerId");

-- CreateIndex
CREATE INDEX "Connection_status_idx" ON "Connection"("status");

-- CreateIndex
CREATE INDEX "ConnectionSecretReference_customerId_idx" ON "ConnectionSecretReference"("customerId");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_companyName_idx" ON "Customer"("companyName");

-- CreateIndex
CREATE INDEX "CustomerUser_customerId_idx" ON "CustomerUser"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUser_customerId_userId_key" ON "CustomerUser"("customerId", "userId");

-- CreateIndex
CREATE INDEX "SqlEndpoint_customerId_idx" ON "SqlEndpoint"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SqlEndpoint_fabricLakehouseId_key" ON "SqlEndpoint"("fabricLakehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringConfiguration_customerId_key" ON "MonitoringConfiguration"("customerId");

-- CreateIndex
CREATE INDEX "DatasetCatalogEntry_customerId_idx" ON "DatasetCatalogEntry"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetCatalogEntry_customerId_desiredResourceLogicalName_key" ON "DatasetCatalogEntry"("customerId", "desiredResourceLogicalName");

-- CreateIndex
CREATE UNIQUE INDEX "FabricCapability_itemType_key" ON "FabricCapability"("itemType");

-- CreateIndex
CREATE INDEX "FabricCapability_category_idx" ON "FabricCapability"("category");

-- CreateIndex
CREATE INDEX "FabricCapability_enabled_idx" ON "FabricCapability"("enabled");

-- CreateIndex
CREATE INDEX "FabricParameterSchema_fabricCapabilityId_mode_idx" ON "FabricParameterSchema"("fabricCapabilityId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "FabricParameterSchema_fabricCapabilityId_key_key" ON "FabricParameterSchema"("fabricCapabilityId", "key");

-- CreateIndex
CREATE INDEX "IngestionConfiguration_infrastructureConfigurationId_idx" ON "IngestionConfiguration"("infrastructureConfigurationId");

-- CreateIndex
CREATE INDEX "Notification_customerId_idx" ON "Notification"("customerId");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Alert_customerId_idx" ON "Alert"("customerId");

-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE INDEX "Alert_severity_idx" ON "Alert"("severity");

-- CreateIndex
CREATE INDEX "Deployment_customerId_idx" ON "Deployment"("customerId");

-- CreateIndex
CREATE INDEX "Deployment_status_idx" ON "Deployment"("status");

-- CreateIndex
CREATE INDEX "DeploymentStep_deploymentId_sequence_idx" ON "DeploymentStep"("deploymentId", "sequence");

-- CreateIndex
CREATE INDEX "DeploymentStep_status_idx" ON "DeploymentStep"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentStep_deploymentId_stepKey_key" ON "DeploymentStep"("deploymentId", "stepKey");

-- CreateIndex
CREATE INDEX "LongRunningOperation_status_idx" ON "LongRunningOperation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LongRunningOperation_deploymentStepId_operationId_key" ON "LongRunningOperation"("deploymentStepId", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAgent_userId_key" ON "ServiceAgent"("userId");

-- CreateIndex
CREATE INDEX "ServiceAgent_active_idx" ON "ServiceAgent"("active");

-- CreateIndex
CREATE INDEX "Appointment_customerId_idx" ON "Appointment"("customerId");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "Appointment_startTime_idx" ON "Appointment"("startTime");

-- AddForeignKey
ALTER TABLE "CustomerAccess" ADD CONSTRAINT "CustomerAccess_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blueprint" ADD CONSTRAINT "Blueprint_clonedFromId_fkey" FOREIGN KEY ("clonedFromId") REFERENCES "Blueprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintResource" ADD CONSTRAINT "BlueprintResource_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintResource" ADD CONSTRAINT "BlueprintResource_itemType_fkey" FOREIGN KEY ("itemType") REFERENCES "FabricCapability"("itemType") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfrastructureConfiguration" ADD CONSTRAINT "InfrastructureConfiguration_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfrastructureConfiguration" ADD CONSTRAINT "InfrastructureConfiguration_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationVersion" ADD CONSTRAINT "ConfigurationVersion_infrastructureConfigurationId_fkey" FOREIGN KEY ("infrastructureConfigurationId") REFERENCES "InfrastructureConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesiredResource" ADD CONSTRAINT "DesiredResource_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesiredResource" ADD CONSTRAINT "DesiredResource_type_fkey" FOREIGN KEY ("type") REFERENCES "FabricCapability"("itemType") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualResource" ADD CONSTRAINT "ActualResource_desiredResourceId_fkey" FOREIGN KEY ("desiredResourceId") REFERENCES "DesiredResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_infrastructureConfigurationId_fkey" FOREIGN KEY ("infrastructureConfigurationId") REFERENCES "InfrastructureConfiguration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_connectorTypeKey_fkey" FOREIGN KEY ("connectorTypeKey") REFERENCES "ConnectorMetadata"("connectionTypeKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionSecretReference" ADD CONSTRAINT "ConnectionSecretReference_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUser" ADD CONSTRAINT "CustomerUser_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUser" ADD CONSTRAINT "CustomerUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SqlEndpoint" ADD CONSTRAINT "SqlEndpoint_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringConfiguration" ADD CONSTRAINT "MonitoringConfiguration_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetCatalogEntry" ADD CONSTRAINT "DatasetCatalogEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FabricParameterSchema" ADD CONSTRAINT "FabricParameterSchema_fabricCapabilityId_fkey" FOREIGN KEY ("fabricCapabilityId") REFERENCES "FabricCapability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionConfiguration" ADD CONSTRAINT "IngestionConfiguration_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionConfiguration" ADD CONSTRAINT "IngestionConfiguration_infrastructureConfigurationId_fkey" FOREIGN KEY ("infrastructureConfigurationId") REFERENCES "InfrastructureConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_infrastructureConfigurationId_fkey" FOREIGN KEY ("infrastructureConfigurationId") REFERENCES "InfrastructureConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentStep" ADD CONSTRAINT "DeploymentStep_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentStep" ADD CONSTRAINT "DeploymentStep_desiredResourceId_fkey" FOREIGN KEY ("desiredResourceId") REFERENCES "DesiredResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LongRunningOperation" ADD CONSTRAINT "LongRunningOperation_deploymentStepId_fkey" FOREIGN KEY ("deploymentStepId") REFERENCES "DeploymentStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAgent" ADD CONSTRAINT "ServiceAgent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceAgentId_fkey" FOREIGN KEY ("serviceAgentId") REFERENCES "ServiceAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
