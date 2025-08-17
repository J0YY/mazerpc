import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
const serviceName = process.env.OTEL_SERVICE_NAME || "room-authority";

const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });
const sdk = new NodeSDK({ traceExporter: exporter, serviceName });

sdk.start().catch(() => {/* ignore */});


