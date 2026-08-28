import "dotenv/config";
import type { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/db/prisma";
import { fabricCapabilityRegistry } from "../src/services/fabric/capability-registry";
import { fabricCapabilitySeed } from "./seed/fabric-capabilities";
import { blueprintSeed } from "./seed/blueprints";
import { connectorSeed } from "./seed/connectors";

async function seedCapabilities() {
  for (const capability of fabricCapabilitySeed) {
    await fabricCapabilityRegistry.registerCapability(capability);
  }
  console.log(`Seeded ${fabricCapabilitySeed.length} Fabric capabilities`);
}

async function seedBlueprints() {
  for (const blueprint of blueprintSeed) {
    const existing = await prisma.blueprint.findUnique({ where: { key: blueprint.key } });
    if (existing) {
      await prisma.blueprintResource.deleteMany({ where: { blueprintId: existing.id } });
    }

    const resourceData = blueprint.resources.map((r) => ({
      itemType: r.itemType,
      logicalName: r.logicalName,
      displayNameTemplate: r.displayNameTemplate,
      configuration: (r.configuration ?? {}) as Prisma.InputJsonValue,
      dependsOn: r.dependsOn ?? [],
      optional: r.optional ?? false,
      layer: r.layer,
      sortOrder: r.sortOrder,
    }));

    await prisma.blueprint.upsert({
      where: { key: blueprint.key },
      create: {
        key: blueprint.key,
        name: blueprint.name,
        description: blueprint.description,
        pattern: blueprint.pattern,
        isSystem: true,
        resources: { create: resourceData },
      },
      update: {
        name: blueprint.name,
        description: blueprint.description,
        pattern: blueprint.pattern,
        resources: { create: resourceData },
      },
    });
  }
  console.log(`Seeded ${blueprintSeed.length} blueprints`);
}

async function seedConnectors() {
  for (const connector of connectorSeed) {
    const data = {
      displayName: connector.displayName,
      category: connector.category,
      creationMethodsJson: connector.creationMethods as unknown as Prisma.InputJsonValue,
      supportedCredentialTypesJson: connector.authMethods as unknown as Prisma.InputJsonValue,
      gatewayRequired: connector.gatewayRequired ?? false,
      iconKey: connector.iconKey,
      lastSyncedAt: new Date(),
    };
    await prisma.connectorMetadata.upsert({
      where: { connectionTypeKey: connector.connectionTypeKey },
      create: { connectionTypeKey: connector.connectionTypeKey, ...data },
      update: data,
    });
  }
  console.log(`Seeded ${connectorSeed.length} connectors`);
}

async function seedDemoData() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@oneclick-fabric.example" },
    update: {},
    create: { email: "admin@oneclick-fabric.example", name: "Platform Admin", role: "platform_admin" },
  });

  const agentUser = await prisma.user.upsert({
    where: { email: "agent@oneclick-fabric.example" },
    update: {},
    create: { email: "agent@oneclick-fabric.example", name: "Fabric Consultant", role: "service_agent" },
  });

  await prisma.serviceAgent.upsert({
    where: { userId: agentUser.id },
    update: {},
    create: {
      userId: agentUser.id,
      skills: ["fabric", "power_bi", "data_engineering"],
      language: "en",
      workingHoursJson: {
        monday: ["09:00-17:00"],
        tuesday: ["09:00-17:00"],
        wednesday: ["09:00-17:00"],
        thursday: ["09:00-17:00"],
        friday: ["09:00-15:00"],
      },
    },
  });

  // A couple more agents with different skills/languages so the
  // appointment picker and autoAssignServiceAgent (brief section 26) have
  // something real to match against in demo mode.
  const dataScienceAgentUser = await prisma.user.upsert({
    where: { email: "agent.datascience@oneclick-fabric.example" },
    update: {},
    create: { email: "agent.datascience@oneclick-fabric.example", name: "Data Science Specialist", role: "service_agent" },
  });
  await prisma.serviceAgent.upsert({
    where: { userId: dataScienceAgentUser.id },
    update: {},
    create: {
      userId: dataScienceAgentUser.id,
      skills: ["data_science", "realtime"],
      language: "en",
      workingHoursJson: {
        tuesday: ["10:00-16:00"],
        wednesday: ["10:00-16:00"],
        thursday: ["10:00-16:00"],
      },
    },
  });

  const powerBiAgentUserDe = await prisma.user.upsert({
    where: { email: "agent.powerbi.de@oneclick-fabric.example" },
    update: {},
    create: { email: "agent.powerbi.de@oneclick-fabric.example", name: "Power BI Consultant (DE)", role: "service_agent" },
  });
  await prisma.serviceAgent.upsert({
    where: { userId: powerBiAgentUserDe.id },
    update: {},
    create: {
      userId: powerBiAgentUserDe.id,
      skills: ["power_bi"],
      language: "de",
      workingHoursJson: {
        monday: ["08:00-16:00"],
        tuesday: ["08:00-16:00"],
        wednesday: ["08:00-16:00"],
        thursday: ["08:00-16:00"],
        friday: ["08:00-13:00"],
      },
    },
  });

  const demoCustomer = await prisma.customer.upsert({
    where: { id: "demo-customer" },
    update: {},
    create: {
      id: "demo-customer",
      companyName: "Contoso Retail GmbH",
      contactFirstName: "Jamie",
      contactLastName: "Contoso",
      contactEmail: "jamie@contoso.example",
      contactPhone: "+49 30 1234567",
      environmentMode: "single",
      serviceTier: "standard",
      status: "draft",
      createdById: admin.id,
    },
  });

  console.log(
    `Seeded demo user ${admin.email}, agents ${agentUser.email}/${dataScienceAgentUser.email}/${powerBiAgentUserDe.email}, customer ${demoCustomer.companyName}`,
  );
}

async function main() {
  await seedCapabilities();
  await seedBlueprints();
  await seedConnectors();
  await seedDemoData();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
