import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import { registerFabricCapabilityInput, type RegisterFabricCapabilityDraft } from "@/schemas/fabric-capability";
import type { FabricCapability, FabricParameterSchema } from "@/generated/prisma/client";

const log = childLogger({ module: "fabric.capability-registry" });

export type CapabilityWithParameters = FabricCapability & { parameterSchemas: FabricParameterSchema[] };

/**
 * Single source of truth for "what can OneClick provision in Fabric".
 * Nothing in the UI or provisioning engine hardcodes an item type — every
 * consumer goes through this service. See docs/FABRIC_API.md for how to
 * add a new capability as Microsoft ships new Fabric item types.
 */
export class FabricCapabilityRegistryService {
  async getCapabilities(options?: { enabledOnly?: boolean; category?: string }): Promise<CapabilityWithParameters[]> {
    return prisma.fabricCapability.findMany({
      where: {
        enabled: options?.enabledOnly ? true : undefined,
        category: options?.category as never,
      },
      include: { parameterSchemas: { orderBy: { sortOrder: "asc" } } },
      orderBy: { displayName: "asc" },
    });
  }

  async getCapability(itemType: string): Promise<CapabilityWithParameters | null> {
    return prisma.fabricCapability.findUnique({
      where: { itemType },
      include: { parameterSchemas: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async getSupportedCapabilities(): Promise<CapabilityWithParameters[]> {
    return this.getCapabilities({ enabledOnly: true });
  }

  /** True when a capability exists, is enabled, and documents create
   * support — the single check the wizard/planner use to decide whether a
   * blueprint resource can actually be provisioned. */
  async isProvisionable(itemType: string): Promise<boolean> {
    const capability = await this.getCapability(itemType);
    return Boolean(capability?.enabled && capability.createSupported);
  }

  async registerCapability(draft: RegisterFabricCapabilityDraft): Promise<CapabilityWithParameters> {
    const input = registerFabricCapabilityInput.parse(draft);
    const capability = await prisma.fabricCapability.upsert({
      where: { itemType: input.itemType },
      create: {
        itemType: input.itemType,
        displayName: input.displayName,
        category: input.category,
        description: input.description,
        apiPath: input.apiPath,
        createSupported: input.createSupported,
        updateSupported: input.updateSupported,
        deleteSupported: input.deleteSupported,
        definitionSupported: input.definitionSupported,
        creationPayloadSupported: input.creationPayloadSupported,
        folderSupported: input.folderSupported,
        servicePrincipalSupported: input.servicePrincipalSupported,
        requiredScopes: input.requiredScopes,
        documentationUrl: input.documentationUrl,
        enabled: input.enabled,
        lastVerifiedAt: new Date(),
        parameterSchemas: {
          create: input.parameters.map((p) => ({
            key: p.key,
            label: p.label,
            description: p.description,
            inputType: p.inputType,
            mode: p.mode,
            required: p.required,
            defaultValue: p.defaultValue ?? undefined,
            optionsJson: p.options ?? undefined,
            validationJson: p.validation ?? undefined,
            targetPath: p.targetPath,
            sortOrder: p.sortOrder,
          })),
        },
      },
      update: {
        displayName: input.displayName,
        category: input.category,
        description: input.description,
        apiPath: input.apiPath,
        createSupported: input.createSupported,
        updateSupported: input.updateSupported,
        deleteSupported: input.deleteSupported,
        definitionSupported: input.definitionSupported,
        creationPayloadSupported: input.creationPayloadSupported,
        folderSupported: input.folderSupported,
        servicePrincipalSupported: input.servicePrincipalSupported,
        requiredScopes: input.requiredScopes,
        documentationUrl: input.documentationUrl,
        enabled: input.enabled,
        lastVerifiedAt: new Date(),
      },
      include: { parameterSchemas: { orderBy: { sortOrder: "asc" } } },
    });

    log.info({ itemType: input.itemType }, "Fabric capability registered/updated");
    return capability;
  }

  async updateCapability(
    itemType: string,
    patch: Partial<Pick<FabricCapability, "displayName" | "description" | "enabled" | "documentationUrl">>,
  ): Promise<FabricCapability> {
    return prisma.fabricCapability.update({ where: { itemType }, data: patch });
  }

  async disableCapability(itemType: string): Promise<FabricCapability> {
    log.warn({ itemType }, "Fabric capability disabled");
    return prisma.fabricCapability.update({ where: { itemType }, data: { enabled: false } });
  }
}

export const fabricCapabilityRegistry = new FabricCapabilityRegistryService();
