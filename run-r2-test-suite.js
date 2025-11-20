/**
 * Master R2 Test Suite Execution Script
 *
 * This script executes all R2 user-centric storage tests and generates a comprehensive report:
 * - Runs all test suites in the correct order
 * - Aggregates results from all test suites
 * - Generates a comprehensive implementation report
 * - Provides deployment readiness assessment
 * - Creates actionable recommendations
 *
 * Run with: node run-r2-test-suite.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

class R2TestSuiteExecutor {
  constructor() {
    this.testSuites = [
      {
        name: "Implementation Validation",
        script: "./validate-r2-implementation.js",
        path: "backend_threadtake",
        critical: true,
      },
      {
        name: "Security Validation",
        script: "./test-r2-security-comprehensive.js",
        path: "backend_threadtake",
        critical: true,
      },
      {
        name: "Migration Validation",
        script: "./test-r2-migration-comprehensive.js",
        path: "backend_threadtake",
        critical: true,
      },
      {
        name: "Integration Tests",
        script: "./test-r2-complete-integration.js",
        path: "backend_threadtake",
        critical: true,
      },
      {
        name: "Performance Benchmarks",
        script: "./benchmark-r2-performance.js",
        path: "backend_threadtake",
        critical: false,
      },
      {
        name: "Frontend Integration",
        script: "./test-r2-frontend-integration.js",
        path: "frontend_threadtake",
        critical: false,
      },
    ];

    this.testResults = [];
    this.suiteResults = {};
    this.startTime = Date.now();
  }

  /**
   * Log test suite execution status
   */
  logExecution(suiteName, status, message, details = null) {
    const result = {
      suiteName,
      status,
      message,
      details,
      timestamp: new Date().toISOString(),
    };
    this.testResults.push(result);

    const statusIcon =
      status === "PASS"
        ? "✅"
        : status === "FAIL"
        ? "❌"
        : status === "SKIP"
        ? "⏭️"
        : "⚠️";
    console.log(`${statusIcon} ${suiteName}: ${message}`);

    if (details && status === "FAIL") {
      console.log("   Details:", JSON.stringify(details, null, 2));
    }
  }

  /**
   * Execute a test suite
   */
  async executeTestSuite(suite) {
    console.log(`\n🧪 Executing ${suite.name} Test Suite`);
    console.log("=".repeat(50));

    const suiteStartTime = Date.now();
    let result = null;
    let status = "PASS";
    let message = "Test suite completed successfully";

    try {
      // Change to the test suite directory
      const originalDir = process.cwd();
      process.chdir(path.join(__dirname, "..", suite.path));

      // Execute the test suite
      console.log(`Running: ${suite.script}`);
      const output = execSync(`node ${suite.script}`, {
        encoding: "utf8",
        stdio: "pipe",
        timeout: 300000, // 5 minute timeout
      });

      // Parse the output to extract results
      const reportPath = this.extractReportPath(output);

      if (reportPath && fs.existsSync(reportPath)) {
        try {
          const reportData = fs.readFileSync(reportPath, "utf8");
          result = JSON.parse(reportData);

          // Determine status based on results
          if (
            result.failedTests > 0 ||
            result.failedValidations > 0 ||
            result.securityIncidents > 0
          ) {
            status = suite.critical ? "FAIL" : "WARN";
            message = `Test suite completed with issues`;
          }
        } catch (parseError) {
          status = "WARN";
          message = `Test suite completed but report parsing failed`;
          console.log(
            `Warning: Could not parse report from ${reportPath}: ${parseError.message}`
          );
        }
      } else {
        status = "WARN";
        message = `Test suite completed but no report found`;
        console.log(`Warning: No report found for ${suite.name}`);
      }

      // Return to original directory
      process.chdir(originalDir);
    } catch (error) {
      status = "FAIL";
      message = `Test suite execution failed: ${error.message}`;

      // Return to original directory
      try {
        process.chdir(path.join(__dirname, "..", suite.path));
        process.chdir(path.join(__dirname, ".."));
      } catch (dirError) {
        // Ignore directory change errors
      }

      console.log(`Error executing ${suite.name}:`, error.message);
    }

    const suiteDuration = Date.now() - suiteStartTime;

    this.suiteResults[suite.name] = {
      status,
      message,
      duration: suiteDuration,
      result,
      critical: suite.critical,
    };

    this.logExecution(suite.name, status, `${message} (${suiteDuration}ms)`, {
      duration: suiteDuration,
      critical: suite.critical,
    });

    return this.suiteResults[suite.name];
  }

  /**
   * Extract report path from test output
   */
  extractReportPath(output) {
    const reportPathRegex = /Detailed .+ report saved to: (.+\.json)/;
    const match = output.match(reportPathRegex);
    return match ? match[1].trim() : null;
  }

  /**
   * Execute all test suites
   */
  async executeAllTestSuites() {
    console.log("🚀 Starting R2 Complete Test Suite Execution");
    console.log("==========================================");

    for (const suite of this.testSuites) {
      await this.executeTestSuite(suite);
    }

    const totalDuration = Date.now() - this.startTime;
    console.log(`\n⏱️ Total test suite execution time: ${totalDuration}ms`);

    return this.suiteResults;
  }

  /**
   * Generate comprehensive implementation report
   */
  generateComprehensiveReport() {
    console.log("\n📊 R2 Implementation Comprehensive Report");
    console.log("==========================================");

    const totalSuites = this.testSuites.length;
    const passedSuites = Object.values(this.suiteResults).filter(
      (r) => r.status === "PASS"
    ).length;
    const failedSuites = Object.values(this.suiteResults).filter(
      (r) => r.status === "FAIL"
    ).length;
    const warnedSuites = Object.values(this.suiteResults).filter(
      (r) => r.status === "WARN"
    ).length;
    const criticalSuites = Object.values(this.suiteResults).filter(
      (r) => r.status === "FAIL" && r.critical
    ).length;

    console.log(`\nTest Suite Summary:`);
    console.log(`  Total Test Suites: ${totalSuites}`);
    console.log(`  Passed: ${passedSuites} ✅`);
    console.log(`  Failed: ${failedSuites} ❌`);
    console.log(`  Warnings: ${warnedSuites} ⚠️`);
    console.log(`  Critical Failures: ${criticalSuites} 🔴`);

    // Aggregate metrics from all test suites
    const aggregatedMetrics = this.aggregateTestMetrics();

    console.log(`\nAggregated Test Metrics:`);
    console.log(`  Total Tests: ${aggregatedMetrics.totalTests}`);
    console.log(`  Passed Tests: ${aggregatedMetrics.passedTests}`);
    console.log(`  Failed Tests: ${aggregatedMetrics.failedTests}`);
    console.log(
      `  Overall Success Rate: ${aggregatedMetrics.successRate.toFixed(1)}%`
    );

    if (aggregatedMetrics.securityIncidents > 0) {
      console.log(
        `  Security Incidents: ${aggregatedMetrics.securityIncidents} 🔴`
      );
    }

    console.log(`\nTest Suite Results:`);
    Object.entries(this.suiteResults).forEach(([suiteName, result]) => {
      const statusIcon =
        result.status === "PASS"
          ? "✅"
          : result.status === "FAIL"
          ? "❌"
          : result.status === "SKIP"
          ? "⏭️"
          : "⚠️";
      const criticalIcon = result.critical ? " (Critical)" : "";
      console.log(
        `  ${statusIcon} ${suiteName}${criticalIcon}: ${result.message}`
      );

      if (result.result) {
        if (result.result.totalTests) {
          console.log(
            `    Tests: ${result.result.passedTests || 0}/${
              result.result.totalTests
            } passed`
          );
        }
        if (result.result.securityScore) {
          console.log(`    Security Score: ${result.result.securityScore}%`);
        }
        if (result.result.validationResults) {
          const validations = result.result.validationResults;
          const passed = validations.filter((v) => v.status === "PASS").length;
          console.log(
            `    Validations: ${passed}/${validations.length} passed`
          );
        }
      }
    });

    // Generate deployment readiness assessment
    const deploymentReadiness = this.assessDeploymentReadiness();

    console.log(`\nDeployment Readiness Assessment:`);
    console.log(`  Overall Status: ${deploymentReadiness.status}`);
    console.log(`  Readiness Score: ${deploymentReadiness.score}/100`);
    console.log(`  Recommendation: ${deploymentReadiness.recommendation}`);

    if (deploymentReadiness.blockingIssues.length > 0) {
      console.log(`\nBlocking Issues:`);
      deploymentReadiness.blockingIssues.forEach((issue) => {
        console.log(`  🔴 ${issue.suite}: ${issue.issue}`);
      });
    }

    if (deploymentReadiness.recommendations.length > 0) {
      console.log(`\nRecommendations:`);
      deploymentReadiness.recommendations.forEach((rec) => {
        console.log(`  💡 ${rec}`);
      });
    }

    // Generate performance summary
    const performanceSummary = this.generatePerformanceSummary();

    console.log(`\nPerformance Summary:`);
    console.log(
      `  Average Response Time: ${performanceSummary.avgResponseTime.toFixed(
        2
      )}ms`
    );
    console.log(
      `  Average Throughput: ${performanceSummary.avgThroughput.toFixed(
        2
      )} ops/sec`
    );
    console.log(
      `  Memory Usage: ${performanceSummary.memoryUsage.toFixed(2)}MB`
    );

    // Generate final report object
    const report = {
      executionTime: Date.now() - this.startTime,
      testSuites: totalSuites,
      passedSuites,
      failedSuites,
      warnedSuites,
      criticalSuites,
      aggregatedMetrics,
      suiteResults: this.suiteResults,
      deploymentReadiness,
      performanceSummary,
      generatedAt: new Date().toISOString(),
    };

    // Save comprehensive report
    const reportPath = "./r2-comprehensive-test-report.json";
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Comprehensive test report saved to: ${reportPath}`);

    // Generate markdown report
    const markdownReport = this.generateMarkdownReport(report);
    const markdownPath = "./R2_TEST_REPORT.md";
    fs.writeFileSync(markdownPath, markdownReport);
    console.log(`📄 Markdown test report saved to: ${markdownPath}`);

    return report;
  }

  /**
   * Aggregate test metrics from all test suites
   */
  aggregateTestMetrics() {
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let securityIncidents = 0;
    let performanceMetrics = {
      totalDuration: 0,
      avgResponseTime: 0,
      avgThroughput: 0,
    };

    Object.values(this.suiteResults).forEach((result) => {
      if (result.result) {
        if (result.result.totalTests) {
          totalTests += result.result.totalTests;
          passedTests += result.result.passedTests || 0;
          failedTests += result.result.failedTests || 0;
        }

        if (result.result.securityIncidents) {
          securityIncidents += result.result.securityIncidents;
        }

        if (result.result.performanceMetrics) {
          performanceMetrics.totalDuration += result.duration;
          // Add more performance metrics aggregation as needed
        }
      }
    });

    const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    return {
      totalTests,
      passedTests,
      failedTests,
      securityIncidents,
      successRate,
      performanceMetrics,
    };
  }

  /**
   * Assess deployment readiness
   */
  assessDeploymentReadiness() {
    let score = 100;
    const blockingIssues = [];
    const recommendations = [];

    // Check for critical test failures
    Object.entries(this.suiteResults).forEach(([suiteName, result]) => {
      if (result.status === "FAIL" && result.critical) {
        score -= 30;
        blockingIssues.push({
          suite: suiteName,
          issue: result.message,
        });
        recommendations.push(
          `Fix critical issues in ${suiteName} before deployment`
        );
      } else if (result.status === "FAIL") {
        score -= 15;
        recommendations.push(
          `Address issues in ${suiteName} before deployment`
        );
      } else if (result.status === "WARN") {
        score -= 5;
        recommendations.push(`Review warnings in ${suiteName}`);
      }
    });

    // Check security incidents
    const securitySuite = this.suiteResults["Security Validation"];
    if (securitySuite && securitySuite.result) {
      const criticalIssues =
        securitySuite.result.securityIncidents?.filter(
          (i) => i.severity === "CRITICAL"
        ) || [];
      if (criticalIssues.length > 0) {
        score -= 25;
        blockingIssues.push({
          suite: "Security Validation",
          issue: `${criticalIssues.length} critical security issues found`,
        });
        recommendations.push(
          "Resolve all critical security issues before deployment"
        );
      }
    }

    // Check migration issues
    const migrationSuite = this.suiteResults["Migration Validation"];
    if (
      migrationSuite &&
      migrationSuite.result &&
      migrationSuite.result.migrationScore < 85
    ) {
      score -= 20;
      recommendations.push("Improve migration success rate before deployment");
    }

    // Determine overall status
    let status = "READY";
    if (blockingIssues.length > 0) {
      status = "NOT_READY";
    } else if (score < 70) {
      status = "NEEDS_WORK";
    } else if (score < 90) {
      status = "CAUTION";
    }

    // Generate recommendation
    let recommendation = "Ready for production deployment";
    if (status === "NOT_READY") {
      recommendation =
        "Not ready for deployment. Critical issues must be resolved.";
    } else if (status === "NEEDS_WORK") {
      recommendation =
        "Needs significant work before deployment consideration.";
    } else if (status === "CAUTION") {
      recommendation =
        "Proceed with caution. Address recommendations before production.";
    }

    return {
      score: Math.max(0, score),
      status,
      recommendation,
      blockingIssues,
      recommendations,
    };
  }

  /**
   * Generate performance summary
   */
  generatePerformanceSummary() {
    let totalDuration = 0;
    let avgResponseTime = 0;
    let avgThroughput = 0;
    let memoryUsage = 0;
    let performanceDataPoints = 0;

    Object.values(this.suiteResults).forEach((result) => {
      totalDuration += result.duration;

      if (result.result) {
        if (result.result.performanceMetrics) {
          const metrics = result.result.performanceMetrics;
          if (metrics.avgResponseTime) {
            avgResponseTime += metrics.avgResponseTime;
            performanceDataPoints++;
          }
          if (metrics.avgThroughput) {
            avgThroughput += metrics.avgThroughput;
          }
        }

        if (
          result.result.memorySnapshots &&
          result.result.memorySnapshots.length > 0
        ) {
          const snapshots = result.result.memorySnapshots;
          const initialMemory = snapshots[0].heapUsed;
          const finalMemory = snapshots[snapshots.length - 1].heapUsed;
          memoryUsage = Math.max(memoryUsage, finalMemory - initialMemory);
        }
      }
    });

    if (performanceDataPoints > 0) {
      avgResponseTime /= performanceDataPoints;
      avgThroughput /= performanceDataPoints;
    }

    return {
      totalDuration,
      avgResponseTime,
      avgThroughput,
      memoryUsage,
    };
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(report) {
    const date = new Date().toLocaleDateString();
    const time = new Date().toLocaleTimeString();

    let markdown = `# R2 User-Centric Storage Implementation Test Report\n\n`;
    markdown += `**Generated on:** ${date} at ${time}\n`;
    markdown += `**Execution Time:** ${(report.executionTime / 1000).toFixed(
      2
    )} seconds\n\n`;

    markdown += `## Executive Summary\n\n`;
    markdown += `| Metric | Value |\n`;
    markdown += `|--------|-------|\n`;
    markdown += `| Test Suites | ${report.testSuites} |\n`;
    markdown += `| Passed Suites | ${report.passedSuites} |\n`;
    markdown += `| Failed Suites | ${report.failedSuites} |\n`;
    markdown += `| Critical Failures | ${report.criticalSuites} |\n`;
    markdown += `| Total Tests | ${report.aggregatedMetrics.totalTests} |\n`;
    markdown += `| Success Rate | ${report.aggregatedMetrics.successRate.toFixed(
      1
    )}% |\n`;
    markdown += `| Security Incidents | ${report.aggregatedMetrics.securityIncidents} |\n`;
    markdown += `| Deployment Status | ${report.deploymentReadiness.status} |\n`;
    markdown += `| Readiness Score | ${report.deploymentReadiness.score}/100 |\n\n`;

    markdown += `## Test Suite Results\n\n`;
    Object.entries(report.suiteResults).forEach(([suiteName, result]) => {
      const statusIcon =
        result.status === "PASS"
          ? "✅"
          : result.status === "FAIL"
          ? "❌"
          : "⚠️";
      markdown += `### ${statusIcon} ${suiteName}\n\n`;
      markdown += `**Status:** ${result.status}\n`;
      markdown += `**Duration:** ${(result.duration / 1000).toFixed(2)}s\n`;
      markdown += `**Message:** ${result.message}\n\n`;

      if (result.result) {
        if (result.result.totalTests) {
          markdown += `**Tests:** ${result.result.passedTests || 0}/${
            result.result.totalTests
          } passed\n\n`;
        }
        if (result.result.securityScore) {
          markdown += `**Security Score:** ${result.result.securityScore}%\n\n`;
        }
      }
    });

    if (report.deploymentReadiness.blockingIssues.length > 0) {
      markdown += `## Blocking Issues\n\n`;
      report.deploymentReadiness.blockingIssues.forEach((issue) => {
        markdown += `- **${issue.suite}:** ${issue.issue}\n`;
      });
      markdown += `\n`;
    }

    if (report.deploymentReadiness.recommendations.length > 0) {
      markdown += `## Recommendations\n\n`;
      report.deploymentReadiness.recommendations.forEach((rec) => {
        markdown += `- ${rec}\n`;
      });
      markdown += `\n`;
    }

    markdown += `## Performance Summary\n\n`;
    markdown += `| Metric | Value |\n`;
    markdown += `|--------|-------|\n`;
    markdown += `| Average Response Time | ${report.performanceSummary.avgResponseTime.toFixed(
      2
    )}ms |\n`;
    markdown += `| Average Throughput | ${report.performanceSummary.avgThroughput.toFixed(
      2
    )} ops/sec |\n`;
    markdown += `| Memory Usage | ${report.performanceSummary.memoryUsage.toFixed(
      2
    )}MB |\n\n`;

    markdown += `## Conclusion\n\n`;
    markdown += `${report.deploymentReadiness.recommendation}\n\n`;

    return markdown;
  }
}

// Execute the complete test suite
if (require.main === module) {
  const executor = new R2TestSuiteExecutor();
  executor
    .executeAllTestSuites()
    .then(() => {
      const report = executor.generateComprehensiveReport();

      console.log("\n🎉 R2 comprehensive test suite execution completed!");
      console.log(`\nDeployment Status: ${report.deploymentReadiness.status}`);
      console.log(`Readiness Score: ${report.deploymentReadiness.score}/100`);
      console.log(
        `Recommendation: ${report.deploymentReadiness.recommendation}`
      );

      process.exit(report.criticalSuites > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error("\n💥 R2 test suite execution failed:", error);
      process.exit(1);
    });
}

module.exports = { R2TestSuiteExecutor };
