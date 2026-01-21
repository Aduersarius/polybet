import { sleep } from "workflow";

// A simple step to simulate work
const sendWelcomeEmail = async (email: string) => {
    "use step";
    console.log(`📧 Sending welcome email to ${email}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
};

// The workflow entrypoint
export async function exampleWorkflow(email: string) {
    "use workflow";

    console.log("🚀 Starting example workflow");

    await sleep("1s");

    await sendWelcomeEmail(email);

    await sleep("1s");

    console.log("✅ Workflow complete");
    return { status: "completed", email };
}
