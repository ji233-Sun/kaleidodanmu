import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** CLI 经 PKCE / Device Code 换发的访问令牌；只存哈希不存明文。 */
@Entity({ name: 'api_tokens' })
@Index('uq_api_tokens_token_hash', ['tokenHash'], { unique: true })
@Index('idx_api_tokens_user', ['userId'])
export class ApiToken {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_api_tokens',
  })
  id!: number

  @Column({ name: 'user_id', type: 'integer', nullable: false })
  userId!: number

  @Column({ name: 'token_hash', type: 'text', nullable: false })
  tokenHash!: string

  @Column({ type: 'text', default: '[]' })
  scopes!: string // JSON 数组字符串

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt!: Date | null

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt!: Date | null

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date
}
