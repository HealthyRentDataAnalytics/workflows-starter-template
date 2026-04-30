import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";
import { WorkflowStatusDO } from "./durable-object";

interface Env {
	WORKFLOW_STATUS: DurableObjectNamespace<WorkflowStatusDO>;
	MY_WORKFLOW: any;
	RESEND_API_KEY: string;
}

/**
 * This workflow showcases:
 * - Durable step execution with step.do
 * - Time-based delays with step.sleep
 * - Interactive pausing with step.waitForEvent
 * - Data flow between steps
 *
 * @see https://developers.cloudflare.com/workflows
 */
export class MyWorkflow extends WorkflowEntrypoint<
	Env,
	Record<string, unknown>
> {
	async run(event: WorkflowEvent<Record<string, unknown>>, step: WorkflowStep) {
		const instanceId = event.instanceId;

		// Send email notification
		await this.sendEmailNotification();

		// Notify Durable Object of step progress. Called outside step.do, so this
		// operation may repeat. Safe here because updateStep is idempotent.
		// Refer to: https://developers.cloudflare.com/workflows/build/rules-of-workflows/
		const notifyStep = async (
			stepName: string,
			status: "running" | "completed" | "waiting",
		) => {
			try {
				const doId = this.env.WORKFLOW_STATUS.idFromName(instanceId);
				const stub = this.env.WORKFLOW_STATUS.get(doId);
				await stub.updateStep(stepName, status);
			} catch {
				// Silently fail
			}
		};

		// Step 1: Basic step - shows step.do usage
		await notifyStep("process data", "running");
		const result = await step.do("process data", async () => {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			return { processed: true, timestamp: Date.now() };
		});
		await notifyStep("process data", "completed");

		// Step 2: Sleep step - shows step.sleep for delays
		await notifyStep("wait 2 seconds", "running");
		await step.sleep("wait 2 seconds", "2 seconds");
		await notifyStep("wait 2 seconds", "completed");

		// Step 3: Wait for event - shows interactive step.waitForEvent
		await notifyStep("wait for approval", "waiting");
		const approval = await step.waitForEvent("wait for approval", {
			type: "user-approval",
			timeout: "60 minutes",
		});
		await notifyStep("wait for approval", "completed");

		// Step 4: Final step
		await notifyStep("final", "running");
		await step.do("final", async () => {
			console.log("Results:", { result, approval: approval.payload });
			await new Promise((resolve) => setTimeout(resolve, 1000));
		});
		await notifyStep("final", "completed");
	}

	private async sendEmailNotification() {
		try {
			const response = await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.env.RESEND_API_KEY}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					from: 'workflow@tuapp.com', // Cambia esto por un dominio verificado en Resend
					to: ['dataanalyticia@healthyrent.co'], // Cambia esto por el email destinatario
					subject: 'Solicitud de encendido del agente documental HR',
					text: 'Solicitud de encendido del agente documental HR',
				}),
			});

			if (!response.ok) {
				console.error('Error sending email:', await response.text());
			} else {
				console.log('Email sent successfully');
			}
		} catch (error) {
			console.error('Failed to send email:', error);
		}
	}
}
