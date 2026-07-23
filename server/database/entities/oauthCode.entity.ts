import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** OAuth 授权码（Authorization Code + PKCE）；一次性、短时效，只存哈希不存明文。 */
@Entity({ name: 'oauth_codes' })
@Index('uq_oauth_codes_code_hash', ['codeHash'], { unique: true })
@Index('idx_oauth_codes_user', ['userId'])
export class OAuthCode {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_oauth_codes',
  })
  id!: number

  @Column({ name: 'user_id', type: 'integer', nullable: false })
  userId!: number

  @Column({ name: 'code_hash', type: 'text', nullable: false })
  codeHash!: string

  @Column({ name: 'client_id', type: 'text', nullable: false })
  clientId!: string

  @Column({ name: 'redirect_uri', type: 'text', nullable: false })
  redirectUri!: string

  @Column({ type: 'text', default: '[]' })
  scopes!: string // JSON 数组字符串

  @Column({ name: 'code_challenge', type: 'text', nullable: false })
  codeChallenge!: string

  @Column({ name: 'expires_at', type: 'datetime', nullable: false })
  expiresAt!: Date

  @Column({ name: 'used_at', type: 'datetime', nullable: true })
  usedAt!: Date | null

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date
}
