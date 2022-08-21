import { embed } from '@driimus/dynamodb-data-mapper';
import { attribute, autoGeneratedHashKey, rangeKey, table, versionAttribute } from '.';

export class Author {
  @attribute()
  name?: string;

  @attribute({ memberType: { type: 'String' } })
  socialMediaHandles?: Map<string, string>;

  @attribute()
  photo?: Uint8Array;
}

export class Comment {
  /**
   * The time at which this comment was posted
   */
  @attribute()
  timestamp?: Date;

  /**
   * Whether this comment has been approved by a moderator.
   */
  @attribute()
  approved?: boolean;

  /**
   * The title of the comment
   */
  @attribute()
  subject?: string;

  /**
   * The text of the comment
   */
  @attribute()
  text?: string;

  /**
   * The handle of the comment author
   */
  @attribute()
  author?: string;

  /**
   * The number of upvotes this comment has received.
   */
  @attribute()
  upvotes?: number;

  /**
   * The number of downvotes this comment has received.
   */
  @attribute()
  downvotes?: number;

  /**
   * Replies to this comment
   */
  @attribute({ memberType: embed(Comment) })
  replies?: Comment[];
}

@table('Posts')
export class Post {
  @autoGeneratedHashKey()
  id?: string;

  @rangeKey()
  createdAt?: Date;

  @versionAttribute()
  version?: number;

  @attribute()
  author?: Author;

  @attribute()
  content?: string;

  @attribute()
  title?: string;

  @attribute()
  subtitle?: string;

  @attribute()
  imageLink?: string;

  @attribute({ memberType: { type: 'String' } })
  corrections?: string[];

  /**
   * Replies to this post
   */
  @attribute({ memberType: embed(Comment) })
  replies?: Comment[];

  @attribute({ memberType: 'String' })
  tags?: Set<string>;
}