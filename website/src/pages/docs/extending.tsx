import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function ExtendingDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Extending the Runtime</h1>

      <p className="text-xl text-muted-foreground mb-8">
        FORGE provides everything you need for typical web applications. When you need
        something custom, runtime plugins let you extend capabilities while preserving
        the sealed runtime guarantee.
      </p>

      <h2 className="text-2xl font-bold mb-4">Built-in Providers</h2>

      <p className="text-muted-foreground mb-4">
        Common integrations are configured via <code className="text-forge-400">forge.toml</code>—no
        code required:
      </p>

      <CodeBlock
        filename="forge.toml"
        language="bash"
        code={`[database]
provider = "postgres"       # Default, battle-tested
url = "env:DATABASE_URL"

[email]
provider = "sendgrid"       # or "smtp", "ses", "postmark"
api_key = "env:SENDGRID_KEY"

[storage]
provider = "s3"             # or "gcs", "r2", "local"
bucket = "my-uploads"

[auth]
provider = "oauth"          # or "jwt", "magic-link"

[cache]
provider = "redis"          # or "memory"
url = "env:REDIS_URL"`}
      />

      <p className="text-muted-foreground mt-4 mb-8">
        These providers are built into the runtime. Configure and use—no plugin needed.
      </p>

      <h2 className="text-2xl font-bold mb-4">When You Need More</h2>

      <p className="text-muted-foreground mb-4">
        Sometimes built-in providers aren't enough:
      </p>

      <ul className="space-y-2 text-muted-foreground mb-8">
        <li>• You need a different database (MongoDB, MySQL, SQLite)</li>
        <li>• You integrate with a proprietary API (Salesforce, internal systems)</li>
        <li>• You need a specialized capability (ML inference, video processing)</li>
      </ul>

      <p className="text-muted-foreground mb-8">
        Rather than forcing you to eject entirely, FORGE supports <strong className="text-foreground">runtime
        plugins</strong>—Go packages that compile alongside the core runtime.
      </p>

      <h2 className="text-2xl font-bold mb-4">Plugins Compile In</h2>

      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <h4 className="font-semibold text-forge-400 mb-3">Why Compile-Time, Not Runtime Loading?</h4>
        <p className="text-sm text-muted-foreground mb-4">
          FORGE's core promise is "the spec is the truth, the runtime enforces it." If plugins
          could be swapped at runtime, that guarantee weakens.
        </p>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <h5 className="font-semibold text-foreground mb-2">Compile-time (FORGE approach)</h5>
            <ul className="text-muted-foreground space-y-1">
              <li>• Single binary = sealed runtime</li>
              <li>• Type safety verified before deploy</li>
              <li>• What you build is what runs</li>
              <li>• Smaller attack surface</li>
            </ul>
          </div>
          <div>
            <h5 className="font-semibold text-foreground mb-2">Runtime loading (rejected)</h5>
            <ul className="text-muted-foreground space-y-1">
              <li>• Can load arbitrary code at startup</li>
              <li>• Errors discovered in production</li>
              <li>• Runtime can diverge from build</li>
              <li>• Plugin = potential vulnerability</li>
            </ul>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4">Plugin Types</h2>

      <h3 className="text-xl font-semibold mt-6 mb-3">Database Providers</h3>

      <p className="text-muted-foreground mb-4">
        Implement a different storage backend:
      </p>

      <CodeBlock
        filename="plugins/mongodb/provider.go"
        language="typescript"
        code={`package mongodb

import "github.com/forge-lang/forge/runtime/provider"

type MongoDBProvider struct {
    client *mongo.Client
}

func (p *MongoDBProvider) Name() string {
    return "mongodb"
}

func (p *MongoDBProvider) Init(config map[string]string) error {
    // Connect to MongoDB using config["url"]
    client, err := mongo.Connect(context.Background(), options.Client().ApplyURI(config["url"]))
    if err != nil {
        return err
    }
    p.client = client
    return nil
}

func (p *MongoDBProvider) Query(view provider.ViewSpec) ([]map[string]any, error) {
    // Translate FORGE view to MongoDB aggregation pipeline
}

func (p *MongoDBProvider) Execute(action provider.ActionSpec) error {
    // Execute FORGE action against MongoDB
}

// Register at package init
func init() {
    provider.RegisterDatabase(&MongoDBProvider{})
}`}
      />

      <h3 className="text-xl font-semibold mt-8 mb-3">Capability Plugins</h3>

      <p className="text-muted-foreground mb-4">
        Add new effects that jobs can use:
      </p>

      <CodeBlock
        filename="plugins/ml/capability.go"
        language="typescript"
        code={`package ml

import "github.com/forge-lang/forge/runtime/capability"

type InferenceCapability struct {
    model *Model
}

func (c *InferenceCapability) Name() string {
    return "ml.infer"
}

func (c *InferenceCapability) Init(config map[string]string) error {
    // Load ML model from config["model_path"]
    model, err := LoadModel(config["model_path"])
    if err != nil {
        return err
    }
    c.model = model
    return nil
}

func (c *InferenceCapability) Execute(input map[string]any) (map[string]any, error) {
    // Run inference
    result := c.model.Predict(input["text"].(string))
    return map[string]any{"category": result}, nil
}

func init() {
    capability.Register(&InferenceCapability{})
}`}
      />

      <p className="text-muted-foreground mt-4 mb-4">
        Then use in your spec:
      </p>

      <CodeBlock
        code={`job classify_ticket {
  input: Ticket
  needs: Ticket.subject, Ticket.description
  effect: ml.infer    # Your custom capability
}`}
      />

      <h3 className="text-xl font-semibold mt-8 mb-3">Integration Plugins</h3>

      <p className="text-muted-foreground mb-4">
        Sync with external systems:
      </p>

      <CodeBlock
        filename="plugins/salesforce/integration.go"
        language="typescript"
        code={`package salesforce

import "github.com/forge-lang/forge/runtime/integration"

type SalesforceIntegration struct {
    client *salesforce.Client
}

func (i *SalesforceIntegration) Name() string {
    return "salesforce"
}

func (i *SalesforceIntegration) Sync(entity string, data map[string]any) error {
    // Map FORGE entity to Salesforce object and sync
    return i.client.Upsert(entity, data)
}

func init() {
    integration.Register(&SalesforceIntegration{})
}`}
      />

      <p className="text-muted-foreground mt-4 mb-4">
        Use in hooks:
      </p>

      <CodeBlock
        code={`hook Customer.after_create {
  sync salesforce
}

hook Customer.after_update {
  sync salesforce
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Building with Plugins</h2>

      <p className="text-muted-foreground mb-4">
        Plugins are specified at build time:
      </p>

      <CodeBlock
        language="bash"
        code={`# Build with plugins
forge build --plugins ./plugins/mongodb,./plugins/salesforce

# The output includes your plugins compiled in
.forge/
├── artifact.json
├── runtime              # Binary with plugins embedded
└── sdk/`}
      />

      <p className="text-muted-foreground mt-4 mb-4">
        Configure the plugin in <code className="text-forge-400">forge.toml</code>:
      </p>

      <CodeBlock
        filename="forge.toml"
        language="bash"
        code={`[database]
provider = "mongodb"           # Use your plugin
url = "env:MONGODB_URL"

[plugins.salesforce]
client_id = "env:SF_CLIENT_ID"
client_secret = "env:SF_CLIENT_SECRET"

[plugins.ml]
model_path = "./models/classifier.onnx"`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Plugin Interfaces</h2>

      <p className="text-muted-foreground mb-4">
        Plugins implement well-defined Go interfaces:
      </p>

      <CodeBlock
        language="typescript"
        code={`// Database provider interface
type DatabaseProvider interface {
    Name() string
    Init(config map[string]string) error
    Query(view ViewSpec) ([]map[string]any, error)
    Execute(action ActionSpec) error
    Subscribe(view ViewSpec, callback func(Change)) error
    Close() error
}

// Capability interface for job effects
type Capability interface {
    Name() string
    Init(config map[string]string) error
    Execute(input map[string]any) (map[string]any, error)
}

// Integration interface for external sync
type Integration interface {
    Name() string
    Init(config map[string]string) error
    Sync(entity string, data map[string]any) error
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">When to Use What</h2>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Situation</th>
              <th className="text-left py-3 px-4 font-semibold">Solution</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4">Need PostgreSQL</td>
              <td className="py-3 px-4">Built-in (default)</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4">Need SendGrid for email</td>
              <td className="py-3 px-4">Built-in, just configure in toml</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4">Need S3 for uploads</td>
              <td className="py-3 px-4">Built-in, just configure in toml</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4">Need MongoDB</td>
              <td className="py-3 px-4">Write a database provider plugin</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4">Need ML inference in jobs</td>
              <td className="py-3 px-4">Write a capability plugin</td>
            </tr>
            <tr>
              <td className="py-3 px-4">Need Salesforce sync</td>
              <td className="py-3 px-4">Write an integration plugin</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6">
        <h4 className="font-semibold text-emerald-400 mb-2">The Sealed Guarantee Holds</h4>
        <p className="text-sm text-muted-foreground">
          Even with plugins, the runtime remains sealed. Plugins are compiled in—they can't be
          changed without rebuilding. The spec still defines what happens; plugins just extend
          what's possible. A job can't use an effect it didn't declare, even if the plugin provides it.
        </p>
      </div>
    </DocsLayout>
  );
}
