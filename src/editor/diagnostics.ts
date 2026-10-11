import * as vscode from 'vscode';
import { computeProblems } from '../core/diagnostics';
import { isEnvFile } from './envFileSettings';

function isEnvDocument(document: vscode.TextDocument): boolean {
  return isEnvFile(document.uri);
}

/** Publish undefined-reference and cycle warnings for open .env documents to the Problems panel. */
export function registerDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('dotenv-manager');

  const refresh = (document: vscode.TextDocument): void => {
    if (!isEnvDocument(document)) {
      return;
    }
    collection.set(
      document.uri,
      computeProblems(document.getText()).map((problem) => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(problem.line, problem.character, problem.endLine, problem.endCharacter),
          problem.message,
          vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.source = 'Dotenv Manager';
        diagnostic.code = problem.kind;
        return diagnostic;
      }),
    );
  };

  vscode.workspace.textDocuments.forEach(refresh);
  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => refresh(e.document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
  );
}
