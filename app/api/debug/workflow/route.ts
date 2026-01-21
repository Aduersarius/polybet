import { start } from "workflow/api";
import { exampleWorkflow } from "@/workflows/example";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const email = body.email || "test@example.com";

        // Start the workflow
        const run = await start(exampleWorkflow, [email]);

        return NextResponse.json({
            success: true,
            runId: run.run_id,
            message: "Workflow started successfully"
        });
    } catch (error) {
        console.error("Failed to start workflow:", error);
        return NextResponse.json(
            { error: "Failed to start workflow" },
            { status: 500 }
        );
    }
}
