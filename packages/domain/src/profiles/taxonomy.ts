/**
 * Starter vocabulary for partner skills and studio services. It is a shared
 * dictionary, never a claim that either partner has a skill: claims come only
 * from what the operator enters (baseline §4).
 */

export const SKILL_CATEGORIES = {
  data_bi: 'Data analysis and BI',
  ml: 'Machine learning and AI',
  data_eng: 'Data engineering',
  cloud: 'Cloud and infrastructure',
  devops: 'Deployment and DevOps',
  software: 'Software development',
  other: 'Other',
} as const;

export type SkillCategory = keyof typeof SKILL_CATEGORIES;

export interface SeedSkill {
  key: string;
  label: string;
  category: SkillCategory;
  aliases: string[];
}

export const SKILL_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,59}$/;

/**
 * Normalizes a skill name for matching: case, spacing and punctuation are
 * ignored, but C++ and C# stay distinct from C.
 */
export function normalizeSkillName(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]/g, '');
}

/** Turns a label into a skill key, e.g. "Apache Airflow" → "apache-airflow". */
export function skillKeyFromLabel(label: string): string {
  const key = label
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return key;
}

const s = (key: string, label: string, category: SkillCategory, aliases: string[] = []): SeedSkill => ({
  key,
  label,
  category,
  aliases,
});

export const SEED_SKILLS: SeedSkill[] = [
  // Data analysis and BI
  s('sql', 'SQL', 'data_bi', ['structured query language']),
  s('postgresql', 'PostgreSQL', 'data_bi', ['postgres']),
  s('mysql', 'MySQL', 'data_bi'),
  s('sql-server', 'Microsoft SQL Server', 'data_bi', ['mssql', 'sql server', 't-sql', 'tsql']),
  s('excel', 'Microsoft Excel', 'data_bi', ['excel', 'ms excel']),
  s('power-bi', 'Power BI', 'data_bi', ['microsoft power bi', 'power bi desktop', 'pbi']),
  s('dax', 'DAX', 'data_bi', ['data analysis expressions']),
  s('power-query', 'Power Query', 'data_bi', ['power query m', 'm language']),
  s('tableau', 'Tableau', 'data_bi'),
  s('looker-studio', 'Looker Studio', 'data_bi', ['google data studio', 'data studio']),
  s('data-visualization', 'Data visualization', 'data_bi', ['dataviz', 'data visualisation']),
  s('data-cleaning', 'Data cleaning', 'data_bi', ['data wrangling', 'data cleansing']),
  s('data-modeling', 'Data modelling', 'data_bi', ['data modeling', 'dimensional modeling', 'dimensional modelling', 'star schema']),
  s('statistics', 'Statistics', 'data_bi', ['statistical analysis']),
  // Machine learning and AI
  s('python', 'Python', 'ml'),
  s('pandas', 'pandas', 'ml'),
  s('numpy', 'NumPy', 'ml'),
  s('jupyter', 'Jupyter', 'ml', ['jupyter notebook', 'jupyter notebooks']),
  s('scikit-learn', 'scikit-learn', 'ml', ['sklearn']),
  s('xgboost', 'XGBoost', 'ml'),
  s('tensorflow', 'TensorFlow', 'ml'),
  s('pytorch', 'PyTorch', 'ml'),
  s('machine-learning', 'Machine learning', 'ml', ['ml']),
  s('deep-learning', 'Deep learning', 'ml'),
  s('nlp', 'Natural language processing', 'ml', ['nlp']),
  s('time-series-forecasting', 'Time-series forecasting', 'ml', ['forecasting', 'time series', 'time series forecasting']),
  s('llm-applications', 'LLM applications', 'ml', ['llm', 'llms', 'rag', 'retrieval augmented generation', 'generative ai', 'genai']),
  s('model-evaluation', 'Model evaluation', 'ml', ['model validation']),
  // Data engineering
  s('etl', 'ETL and ELT pipelines', 'data_eng', ['etl', 'elt', 'data pipelines', 'data pipeline']),
  s('airflow', 'Apache Airflow', 'data_eng', ['airflow']),
  s('dbt', 'dbt', 'data_eng', ['data build tool']),
  s('spark', 'Apache Spark', 'data_eng', ['spark', 'pyspark']),
  s('kafka', 'Apache Kafka', 'data_eng', ['kafka']),
  s('api-integration', 'API integration', 'data_eng', ['rest api', 'rest apis', 'api development']),
  s('workflow-automation', 'Workflow automation', 'data_eng', ['automation', 'process automation']),
  // Cloud and infrastructure
  s('aws', 'Amazon Web Services', 'cloud', ['aws']),
  s('aws-s3', 'Amazon S3', 'cloud', ['s3']),
  s('aws-ec2', 'Amazon EC2', 'cloud', ['ec2']),
  s('aws-lambda', 'AWS Lambda', 'cloud', ['lambda']),
  s('aws-glue', 'AWS Glue', 'cloud', ['glue']),
  s('aws-redshift', 'Amazon Redshift', 'cloud', ['redshift']),
  s('aws-rds', 'Amazon RDS', 'cloud', ['rds']),
  s('aws-cloudformation', 'AWS CloudFormation', 'cloud', ['cloudformation']),
  s('aws-cdk', 'AWS CDK', 'cloud', ['cdk']),
  s('terraform', 'Terraform', 'cloud'),
  s('linux', 'Linux', 'cloud'),
  // Deployment and DevOps
  s('docker', 'Docker', 'devops'),
  s('kubernetes', 'Kubernetes', 'devops', ['k8s']),
  s('ci-cd', 'CI/CD', 'devops', ['continuous integration', 'continuous delivery', 'continuous deployment']),
  s('github-actions', 'GitHub Actions', 'devops'),
  s('git', 'Git', 'devops'),
  // Software development
  s('typescript', 'TypeScript', 'software', ['ts']),
  s('javascript', 'JavaScript', 'software', ['js']),
  s('nodejs', 'Node.js', 'software', ['node']),
  s('react', 'React', 'software', ['reactjs']),
  s('fastapi', 'FastAPI', 'software'),
  s('flask', 'Flask', 'software'),
  s('django', 'Django', 'software'),
];

export interface SeedService {
  id: string;
  name: string;
  description: string;
  /** Starting search phrases for Phase 3; editable later. */
  searchTerms: string[];
}

/** The six initial service categories (baseline §4). */
export const SEED_SERVICES: SeedService[] = [
  {
    id: 'data-analysis-bi',
    name: 'Data analysis and BI reporting',
    description: 'Data analysis, data cleaning, dashboards and reporting with Power BI, SQL, Excel or Python.',
    searchTerms: ['power bi dashboard', 'data analysis', 'excel reporting', 'sql reporting', 'data cleaning'],
  },
  {
    id: 'machine-learning',
    name: 'Machine learning and predictive modelling',
    description: 'Predictive models, classification, prototypes and model evaluation.',
    searchTerms: ['machine learning model', 'predictive modeling', 'classification model', 'ml prototype'],
  },
  {
    id: 'aws-cloud',
    name: 'AWS cloud infrastructure',
    description: 'AWS architecture, infrastructure setup and cloud migration.',
    searchTerms: ['aws architecture', 'aws infrastructure', 'aws migration', 'aws setup'],
  },
  {
    id: 'data-engineering',
    name: 'Data engineering and automation',
    description: 'ETL, data pipelines, workflow automation and analytical data stores.',
    searchTerms: ['etl pipeline', 'data pipeline', 'data engineering', 'workflow automation'],
  },
  {
    id: 'deployment-devops',
    name: 'Deployment and DevOps',
    description: 'Application deployment, hosting and CI/CD.',
    searchTerms: ['ci/cd pipeline', 'deploy application', 'devops engineer', 'docker deployment'],
  },
  {
    id: 'end-to-end',
    name: 'End-to-end projects',
    description: 'Projects that combine the services above, delivered by both partners together.',
    searchTerms: ['end to end data platform', 'full stack data project', 'analytics platform build'],
  },
];
