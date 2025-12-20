export enum PropType {
  JSON = 0,
  Text = 1,
  BlockRefs = 2,
  Number = 3,
  Boolean = 4,
  DateTime = 5,
  TextChoices = 6,
}

export type QueryOperatorString =
  | ">="
  | ">"
  | "<="
  | "<"
  | "=="
  | "!="
  | "is null"
  | "not null"
  | "includes"
  | "not includes";

export interface QueryPropertyFilterInput {
  name: string;
  op: QueryOperatorString;
  value?: any;
  type?: number;
  typeArgs?: any;
}

export type QuerySortDirection = "ASC" | "DESC";

export type QuerySortInput =
  | string
  | { field: string; direction?: QuerySortDirection }
  | [string, QuerySortDirection];

export interface QueryBlocksByTagOptions {
  properties?: QueryPropertyFilterInput[];
  sort?: QuerySortInput | QuerySortInput[];
  page?: number;
  pageSize?: number;
  maxResults?: number;
}

