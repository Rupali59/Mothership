// gen-ports-env generates a root-level .ports.env file from ports.json.
//
// It reads ports.json (the single source of truth for port assignments) and
// produces a .ports.env file containing:
//   - <SERVICE>_PORT=<port> for every assignment
//   - <SERVICE>_SERVICE_URL=http://<docker-service-name>:<port> for inter-service comms
//
// Usage:
//
//	go run ./cmd/gen-ports-env [flags]
//
// Flags:
//
//	--dry-run   Print .ports.env to stdout instead of writing it.
//	--output    Output file path (default: .ports.env).
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// PortsFile matches the structure of ports.json.
type PortsFile struct {
	Schema      string         `json:"$schema"`
	Bands       map[string]any `json:"bands"`
	Assignments map[string]int `json:"assignments"`
}

// serviceNameMap defines the Docker Compose service name for each path.
// Paths not listed here derive the name from the last segment.
var serviceNameMap = map[string]string{
	"apps/core-server": "backend",
	"apps/frontend":    "frontend",
}

// deriveEnvKey turns a path like "services/health" into "HEALTH".
func deriveEnvKey(path string) string {
	parts := strings.Split(path, "/")
	name := parts[len(parts)-1]

	// Special cases
	switch path {
	case "apps/core-server":
		return "BACKEND"
	case "apps/frontend":
		return "FRONTEND"
	case "services/cloud-adapter":
		return "CLOUD_ADAPTER"
	case "services/inventory-management":
		return "INVENTORY"
	}

	name = strings.ReplaceAll(name, "-", "_")
	return strings.ToUpper(name)
}

// deriveDockerService turns a path into its Docker Compose service name.
func deriveDockerService(path string) string {
	if name, ok := serviceNameMap[path]; ok {
		return name
	}
	parts := strings.Split(path, "/")
	return parts[len(parts)-1]
}

func main() {
	dryRun := flag.Bool("dry-run", false, "Print to stdout instead of writing file")
	output := flag.String("output", ".ports.env", "Output file path")
	flag.Parse()

	// Find repo root by locating ports.json relative to working dir or binary.
	portsPath := "ports.json"
	if _, err := os.Stat(portsPath); os.IsNotExist(err) {
		// Try relative to the executable location.
		exe, _ := os.Executable()
		portsPath = filepath.Join(filepath.Dir(exe), "ports.json")
	}

	data, err := os.ReadFile(portsPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: cannot read ports.json: %v\n", err)
		os.Exit(1)
	}

	var pf PortsFile
	if err := json.Unmarshal(data, &pf); err != nil {
		fmt.Fprintf(os.Stderr, "Error: cannot parse ports.json: %v\n", err)
		os.Exit(1)
	}

	// Sort keys for deterministic output.
	paths := make([]string, 0, len(pf.Assignments))
	for p := range pf.Assignments {
		paths = append(paths, p)
	}
	sort.Strings(paths)

	var sb strings.Builder
	sb.WriteString("# Auto-generated from ports.json — DO NOT EDIT\n")
	sb.WriteString("# Regenerate: go run ./cmd/gen-ports-env\n\n")

	// Section 1: Port assignments
	sb.WriteString("# ── Port Assignments ──────────────────────────────────────\n")
	for _, p := range paths {
		key := deriveEnvKey(p)
		sb.WriteString(fmt.Sprintf("%s_PORT=%d\n", key, pf.Assignments[p]))
	}

	// Section 2: Service URLs (Docker-internal)
	sb.WriteString("\n# ── Service URLs (Docker internal) ────────────────────────\n")
	for _, p := range paths {
		key := deriveEnvKey(p)
		svc := deriveDockerService(p)
		port := pf.Assignments[p]
		sb.WriteString(fmt.Sprintf("%s_SERVICE_URL=http://%s:%d\n", key, svc, port))
	}

	content := sb.String()

	if *dryRun {
		fmt.Print(content)
		return
	}

	if err := os.WriteFile(*output, []byte(content), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "Error: cannot write %s: %v\n", *output, err)
		os.Exit(1)
	}
	fmt.Printf("✓ Generated %s (%d bytes)\n", *output, len(content))

	// Cross-validate with entity_configs.json if it exists.
	crossValidate(pf.Assignments)
}

// crossValidate checks entity_configs.json for service URLs that reference
// ports different from what ports.json defines.
func crossValidate(assignments map[string]int) {
	ecPath := "seeds/data/global/entity_configs.json"
	data, err := os.ReadFile(ecPath)
	if err != nil {
		// Not an error — file may not exist in all environments.
		return
	}

	// Parse as generic map.
	var configs map[string]map[string]map[string]string
	if err := json.Unmarshal(data, &configs); err != nil {
		fmt.Fprintf(os.Stderr, "⚠ Cannot parse %s for cross-validation: %v\n", ecPath, err)
		return
	}

	// Build reverse lookup: port → service path.
	portToPath := make(map[int]string)
	for path, port := range assignments {
		portToPath[port] = path
	}

	// Regex to extract port from URLs like http://host:8091
	re := regexp.MustCompile(`:([0-9]+)$`)
	warnings := 0

	for svcPath, envs := range configs {
		for envName, vars := range envs {
			for key, val := range vars {
				if !strings.HasSuffix(key, "_URL") {
					continue
				}
				matches := re.FindStringSubmatch(val)
				if len(matches) < 2 {
					continue
				}
				port, _ := strconv.Atoi(matches[1])
				if port == 0 {
					continue
				}
				// Check if this port is known in ports.json.
				if assignedPath, ok := portToPath[port]; ok {
					_ = assignedPath // Port matches — all good.
				} else {
					// Port not in ports.json — could be external.
					// Only warn if the port is in the 8080-8099 range (our services band).
					if port >= 8080 && port <= 8099 {
						fmt.Fprintf(os.Stderr, "⚠ %s.%s.%s=%s references port %d which is not in ports.json\n",
							svcPath, envName, key, val, port)
						warnings++
					}
				}
			}
		}
	}

	if warnings > 0 {
		fmt.Fprintf(os.Stderr, "⚠ %d port drift warning(s) found between entity_configs.json and ports.json\n", warnings)
	}
}
