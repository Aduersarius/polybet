import { symmetricDecrypt } from "better-auth/crypto";
import { prisma } from "../lib/prisma";
import { createOTP } from "@better-auth/utils/otp";

async function testBetterAuthTOTP() {
    const userId = "ChSm4U0Ouovki1Xsy4Qjl2L8D8SsRENK";
    const testCode = process.argv[2] || "";

    const twoFactorRecord = await prisma.twoFactor.findUnique({
        where: { userId },
        select: { secret: true }
    });

    if (!twoFactorRecord?.secret) {
        console.log("No TwoFactor record found");
        await prisma.$disconnect();
        return;
    }

    console.log("Stored secret (encrypted):", twoFactorRecord.secret.substring(0, 30) + "...");

    const authSecret = process.env.BETTER_AUTH_SECRET;
    if (!authSecret) {
        console.log("No auth secret!");
        await prisma.$disconnect();
        return;
    }

    try {
        const decrypted = await symmetricDecrypt({
            key: authSecret,
            data: twoFactorRecord.secret
        });
        console.log("✅ Decryption SUCCESS!");
        console.log("Decrypted secret:", decrypted);

        // Generate current TOTP using Better Auth's library
        const otp = createOTP(decrypted);
        const currentCode = await otp.totp();
        console.log("\n🔐 Current TOTP code (Better Auth):", currentCode);

        if (testCode) {
            console.log("\n--- Testing verification ---");
            console.log("Testing code:", testCode);
            const isValid = await otp.verify(testCode, { window: 1 });
            console.log("Verification result:", isValid ? "✅ VALID" : "❌ INVALID");
        }

    } catch (error: any) {
        console.log("❌ Error:", error.message);
    }

    await prisma.$disconnect();
}

testBetterAuthTOTP();
