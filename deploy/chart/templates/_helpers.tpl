{{- define "taskflow.name" -}}
taskflow
{{- end -}}
{{- define "taskflow.fullname" -}}
{{ .Release.Name }}
{{- end -}}
{{- define "taskflow.labels" -}}
app.kubernetes.io/name: {{ include "taskflow.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: Helm
{{- end -}}
