'use client'

import { FeedbackWidget } from '@cobbl-ai/feedback-widget/react'
import type { RunPromptResponse } from '@cobbl-ai/sdk'
import { CobblAdminClient } from '@cobbl-ai/sdk'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Loader2,
  Play,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ThemeToggle } from '@/components/theme-toggle'
import { useTheme } from 'next-themes'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

type VariableType = 'string' | 'number' | 'boolean' | 'list' | 'object'

// Schema for running a prompt
const runPromptSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  promptSlug: z.string().min(1, 'Prompt slug is required'),
  variables: z.record(z.string(), z.string()),
})

type RunPromptFormData = z.infer<typeof runPromptSchema>

export const PlaygroundPage = () => {
  const { theme, resolvedTheme } = useTheme()
  const [promptResponse, setPromptResponse] =
    useState<RunPromptResponse | null>(null)
  const [feedbackIds, setFeedbackIds] = useState<string[]>([])
  const [widgetKey, setWidgetKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  // Map next-themes values to widget colorScheme
  const widgetColorScheme =
    theme === 'system'
      ? 'auto'
      : ((resolvedTheme as 'light' | 'dark') ?? 'auto')
  const [variableFields, setVariableFields] = useState<
    {
      key: string
      type: VariableType
      value: string
      boolValue: boolean
      parseError?: string
    }[]
  >([])
  const [showRenderedPrompt, setShowRenderedPrompt] = useState(false)
  const [showRunPrompt, setShowRunPrompt] = useState(true)
  const [copiedRunId, setCopiedRunId] = useState(false)
  const [copiedOutput, setCopiedOutput] = useState(false)

  const runPromptForm = useForm<RunPromptFormData>({
    resolver: zodResolver(runPromptSchema),
    defaultValues: {
      apiKey: process.env.NEXT_PUBLIC_PLAYGROUND_API_KEY || '',
      promptSlug: process.env.NEXT_PUBLIC_PLAYGROUND_PROMPT_SLUG || '',
      variables: {},
    },
  })

  const addVariableField = () => {
    setVariableFields([
      ...variableFields,
      { key: '', type: 'string', value: '', boolValue: false },
    ])
  }

  const removeVariableField = (index: number) => {
    setVariableFields(variableFields.filter((_, i) => i !== index))
  }

  const updateVariableField = (
    index: number,
    field: 'key' | 'value' | 'type' | 'boolValue',
    value: string | boolean,
  ) => {
    const updated = [...variableFields]
    if (field === 'type') {
      const newType = value as VariableType
      updated[index].type = newType
      // Reset value when type changes
      if (newType === 'boolean') {
        updated[index].boolValue = false
        updated[index].value = ''
      } else if (newType === 'list' || newType === 'object') {
        updated[index].value = newType === 'list' ? '[]' : '{}'
      } else {
        updated[index].value = ''
      }
      updated[index].parseError = undefined
    } else if (field === 'boolValue') {
      updated[index].boolValue = value as boolean
    } else {
      updated[index][field] = value as string
      // Validate JSON for list and object types
      if (
        field === 'value' &&
        (updated[index].type === 'list' || updated[index].type === 'object')
      ) {
        try {
          JSON.parse(value as string)
          updated[index].parseError = undefined
        } catch (e) {
          updated[index].parseError = 'Invalid JSON'
        }
      }
    }
    setVariableFields(updated)
  }

  const parseVariableValue = (
    type: VariableType,
    value: string,
    boolValue: boolean,
  ): string | number | boolean | unknown[] | Record<string, unknown> => {
    switch (type) {
      case 'string':
        return value
      case 'number': {
        const parsed = parseFloat(value)
        if (isNaN(parsed)) {
          throw new Error(`Invalid number: ${value}`)
        }
        return parsed
      }
      case 'boolean':
        return boolValue
      case 'list':
        try {
          const parsed = JSON.parse(value)
          if (!Array.isArray(parsed)) {
            throw new Error('Value must be an array')
          }
          return parsed
        } catch (e) {
          throw new Error(
            `Invalid list JSON: ${e instanceof Error ? e.message : 'Unknown error'}`,
          )
        }
      case 'object':
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed) || typeof parsed !== 'object') {
            throw new Error('Value must be an object')
          }
          return parsed
        } catch (e) {
          throw new Error(
            `Invalid object JSON: ${e instanceof Error ? e.message : 'Unknown error'}`,
          )
        }
      default:
        return value
    }
  }

  const runPrompt = async (data: RunPromptFormData) => {
    setIsRunning(true)
    setError(null)
    setPromptResponse(null)
    setFeedbackIds([])
    setWidgetKey(0)

    try {
      // Build variables object from variable fields with proper type parsing
      const variables: Record<
        string,
        string | number | boolean | unknown[] | Record<string, unknown>
      > = {}

      for (const field of variableFields) {
        if (field.key.trim()) {
          try {
            variables[field.key.trim()] = parseVariableValue(
              field.type,
              field.value,
              field.boolValue,
            )
          } catch (parseError) {
            throw new Error(
              `Error parsing variable "${field.key}": ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
            )
          }
        }
      }

      const baseUrl = process.env.NEXT_PUBLIC_EXTERNAL_API_URL
      if (!baseUrl) {
        throw new Error('NEXT_PUBLIC_EXTERNAL_API_URL is not configured')
      }

      // Initialize SDK admin client with user's API key and configured base URL
      const client = new CobblAdminClient({
        apiKey: data.apiKey,
        baseUrl,
      })

      const result = await client.runPrompt(data.promptSlug, variables)

      setPromptResponse(result)
      setShowRunPrompt(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setIsRunning(false)
    }
  }

  const copyToClipboard = async (
    text: string,
    setCopied: (value: boolean) => void,
  ) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Code2 className="h-8 w-8" />
              <h1 className="text-4xl font-bold">CobblAPI Playground</h1>
            </div>
            <p className="text-muted-foreground">
              Run a prompt and submit feedback to test your Cobbl environment.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* Run Prompt Section - Collapsible */}
      <div className="mb-6">
        <Collapsible
          open={showRunPrompt}
          onOpenChange={setShowRunPrompt}
          className="border rounded-lg"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50">
            <div>
              <h2 className="text-lg font-semibold">Run Prompt</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Execute a prompt using your API key and provide input variables
              </p>
            </div>
            <ChevronDown
              className={`h-5 w-5 transition-transform duration-200 ${showRunPrompt ? 'rotate-180' : ''}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t">
            <div className="p-6">
              <Form {...runPromptForm}>
                <form
                  onSubmit={runPromptForm.handleSubmit(runPrompt)}
                  className="space-y-4"
                >
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Left Column - API Key & Prompt Slug */}
                    <div className="space-y-4">
                      <FormField
                        control={runPromptForm.control}
                        name="apiKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>API Key</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Enter your API key"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Your organization's API key with runPrompt
                              permission
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={runPromptForm.control}
                        name="promptSlug"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Prompt Slug</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., my-prompt-slug"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              The slug of the prompt you want to run
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Right Column - Variables */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <FormLabel>Input Variables</FormLabel>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addVariableField}
                        >
                          Add Variable
                        </Button>
                      </div>
                      <FormDescription>
                        Add variables with proper types for your prompt
                      </FormDescription>

                      {variableFields.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                          No variables added yet. Click "Add Variable" to get
                          started.
                        </p>
                      )}

                      <div className="space-y-3">
                        {variableFields.map((field, index) => (
                          <div
                            key={index}
                            className="p-3 border rounded-lg space-y-2"
                          >
                            <div className="flex gap-2">
                              <Input
                                placeholder="Variable name (e.g., userName)"
                                value={field.key}
                                onChange={(e) =>
                                  updateVariableField(
                                    index,
                                    'key',
                                    e.target.value,
                                  )
                                }
                                className="flex-1"
                              />
                              <Select
                                value={field.type}
                                onValueChange={(value) =>
                                  updateVariableField(
                                    index,
                                    'type',
                                    value as VariableType,
                                  )
                                }
                              >
                                <SelectTrigger className="w-[140px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="string">String</SelectItem>
                                  <SelectItem value="number">Number</SelectItem>
                                  <SelectItem value="boolean">
                                    Boolean
                                  </SelectItem>
                                  <SelectItem value="list">List</SelectItem>
                                  <SelectItem value="object">Object</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeVariableField(index)}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* Type-specific input */}
                            {field.type === 'string' && (
                              <Textarea
                                placeholder="Enter text value"
                                value={field.value}
                                onChange={(e) =>
                                  updateVariableField(
                                    index,
                                    'value',
                                    e.target.value,
                                  )
                                }
                                className="min-h-[60px] font-mono text-sm"
                              />
                            )}

                            {field.type === 'number' && (
                              <Input
                                type="number"
                                placeholder="Enter number (e.g., 42 or 3.14)"
                                value={field.value}
                                onChange={(e) =>
                                  updateVariableField(
                                    index,
                                    'value',
                                    e.target.value,
                                  )
                                }
                                className="font-mono"
                              />
                            )}

                            {field.type === 'boolean' && (
                              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                                <span className="text-sm font-medium">
                                  Value: {field.boolValue ? 'true' : 'false'}
                                </span>
                                <Switch
                                  checked={field.boolValue}
                                  onCheckedChange={(checked) =>
                                    updateVariableField(
                                      index,
                                      'boolValue',
                                      checked,
                                    )
                                  }
                                />
                              </div>
                            )}

                            {field.type === 'list' && (
                              <div className="space-y-1">
                                <Textarea
                                  placeholder='["item1", "item2", "item3"]'
                                  value={field.value}
                                  onChange={(e) =>
                                    updateVariableField(
                                      index,
                                      'value',
                                      e.target.value,
                                    )
                                  }
                                  className="min-h-[80px] font-mono text-sm"
                                />
                                {field.parseError && (
                                  <p className="text-xs text-destructive flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {field.parseError}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  Enter a valid JSON array
                                </p>
                              </div>
                            )}

                            {field.type === 'object' && (
                              <div className="space-y-1">
                                <Textarea
                                  placeholder='{"key": "value", "count": 5}'
                                  value={field.value}
                                  onChange={(e) =>
                                    updateVariableField(
                                      index,
                                      'value',
                                      e.target.value,
                                    )
                                  }
                                  className="min-h-[80px] font-mono text-sm"
                                />
                                {field.parseError && (
                                  <p className="text-xs text-destructive flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {field.parseError}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  Enter a valid JSON object
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-end">
                    <Button type="submit" disabled={isRunning}>
                      {isRunning ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Run Prompt
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Response and Feedback Section - Two Columns */}
      {promptResponse && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column - Response */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Response</CardTitle>
                <CardDescription>
                  Prompt execution completed successfully
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold">Output</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(promptResponse.output, setCopiedOutput)
                      }
                    >
                      {copiedOutput ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap">
                    {promptResponse.output}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Model</p>
                    <p className="font-medium">
                      {promptResponse.promptVersion.model}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Provider</p>
                    <Badge variant="outline">
                      {promptResponse.promptVersion.provider}
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Token Usage
                  </p>
                  <div className="flex gap-2 text-sm">
                    <Badge variant="secondary">
                      Input: {promptResponse.tokenUsage.inputTokens}
                    </Badge>
                    <Badge variant="secondary">
                      Output: {promptResponse.tokenUsage.outputTokens}
                    </Badge>
                    <Badge variant="secondary">
                      Total: {promptResponse.tokenUsage.totalTokens}
                    </Badge>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Run ID</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(promptResponse.runId, setCopiedRunId)
                      }
                    >
                      {copiedRunId ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <code className="text-xs bg-muted p-1 rounded block">
                    {promptResponse.runId}
                  </code>
                </div>

                <Collapsible
                  open={showRenderedPrompt}
                  onOpenChange={setShowRenderedPrompt}
                >
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full">
                      <ChevronDown
                        className={`h-4 w-4 mr-2 transition-transform ${showRenderedPrompt ? 'rotate-180' : ''}`}
                      />
                      {showRenderedPrompt ? 'Hide' : 'Show'} Rendered Prompt
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap font-mono">
                      {promptResponse.renderedPrompt}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Feedback */}
          <div className="space-y-6">
            {feedbackIds.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Submitted Feedback</CardTitle>
                  <CardDescription>
                    {feedbackIds.length} feedback{' '}
                    {feedbackIds.length === 1 ? 'item' : 'items'} submitted for
                    this run
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {feedbackIds.map((feedbackId, index) => (
                      <Alert key={feedbackId}>
                        <Check className="h-4 w-4" />
                        <AlertDescription>
                          <div className="flex items-center justify-between">
                            <span>
                              <strong>Feedback #{index + 1}</strong>
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {feedbackId.slice(0, 8)}...
                            </Badge>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Submit Feedback</CardTitle>
                <CardDescription>
                  Provide feedback on this prompt execution. You can submit
                  multiple feedback items.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FeedbackWidget
                  key={widgetKey}
                  runId={promptResponse.runId}
                  variant="inline"
                  colorScheme={widgetColorScheme}
                  baseUrl={process.env.NEXT_PUBLIC_EXTERNAL_API_URL}
                  onSuccess={(feedbackId: string) => {
                    setFeedbackIds((prev) => [...prev, feedbackId])
                    setWidgetKey((prev) => prev + 1)
                  }}
                  onError={(error: Error) => {
                    setError(error.message)
                  }}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
